// Reference-ID table serialization — Lua reference semantics across
// save/load:
//
//   - aliasing: two variables referencing ONE table load as one table
//   - cycles: `t.self = t` saves without recursing and loads intact
//   - class instances: the metatable `__index` slot refs the SAME
//     class table the global holds (instances don't drag private
//     copies of their class through the save)
//   - `table.freeze` state and the `#` border hints round-trip
//
// Saves write each distinct table once (tagged `"objid": id`); later
// occurrences write `{"objref": id}`. Loads resolve refs through a
// per-load identity registry (placeholder-filled, so field order
// doesn't matter).
//
// Harness: story A runs `setup()` and pauses at a choice gate; its
// save loads into a FRESH story B, which takes the choice and runs
// `check()` — everything check() observes came through the wire.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileStory(source: string): Record<string, any> {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  if (!result.program.compiled) {
    throw new Error("story failed to compile");
  }
  return result.program.compiled as Record<string, any>;
}

function storySource(
  setupBody: string,
  checkBody: string,
  prelude = "",
): string {
  return `external host_record(v)
${prelude}
-> main
scene main
  & setup()
  choose
    * [go]
  then
    & check()
  end
  done
end

function setup()
${setupBody}
end

function check()
${checkBody}
end
`;
}

function roundTrip(
  setupBody: string,
  checkBody: string,
  prelude = "",
): {
  errors: string[];
  recorded: unknown[];
  savedJson: string;
} {
  const compiled = compileStory(storySource(setupBody, checkBody, prelude));
  const errors: string[] = [];

  const storyA = new RuntimeStory(compiled);
  storyA.BindExternalFunction("host_record", (v: unknown) => v, true);
  storyA.onError = (m: string) => errors.push(`[setup] ${m}`);
  storyA.ContinueMaximally(); // runs setup(), pauses at the choice

  const savedJson = storyA.state.ToJson() as string;

  const storyB = new RuntimeStory(compiled);
  const recorded: unknown[] = [];
  storyB.BindExternalFunction(
    "host_record",
    (v: unknown) => {
      recorded.push(v);
      return v;
    },
    true,
  );
  storyB.onError = (m: string) => errors.push(`[check] ${m}`);
  storyB.state.LoadJson(savedJson);
  storyB.ChooseChoiceIndex(0);
  storyB.ContinueMaximally(); // runs check()

  return { errors, recorded, savedJson };
}

describe("reference-ID table serialization", () => {
  test("aliased tables stay ONE table across save/load", () => {
    const { errors, recorded } = roundTrip(
      `t = { n = 1 }
alias = t`,
      `host_record(rawequal(t, alias))
alias.n = 99
host_record(t.n)`,
    );
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, 99]);
  });

  test("cyclic tables save without crashing and load intact", () => {
    const { errors, recorded } = roundTrip(
      `t = { n = 5 }
t.self = t`,
      `host_record(t.self.n)
host_record(rawequal(t, t.self))
host_record(rawequal(t, t.self.self.self))`,
    );
    expect(errors).toEqual([]);
    expect(recorded).toEqual([5, true, true]);
  });

  test("class instances share ONE class table after load", () => {
    const { errors, recorded } = roundTrip(
      `h1 = new Hero()
h2 = new Hero()
h1:levelUp()`,
      `host_record(h1.hp)
host_record(h2.hp)
h1:levelUp()
host_record(h1.hp)
host_record(rawequal(getmetatable(h1).__index, getmetatable(h2).__index))
host_record(h1.title)`,
      `
define Hero with
  store hp = 10
  title = "wanderer"
  levelUp()
    self.hp = self.hp + 5
  end
end
`,
    );
    expect(errors).toEqual([]);
    expect(recorded).toEqual([
      15, // h1's pre-save levelUp survived
      10, // h2 untouched
      20, // methods still dispatch after load
      true, // both instances chain to the SAME class table
      "wanderer", // non-store default reads through the chain
    ]);
  });

  test("save size: shared tables serialize once, refs thereafter", () => {
    const { savedJson, errors } = roundTrip(
      `h1 = new Hero()
h2 = new Hero()
h3 = new Hero()`,
      `host_record(h1.hp)`,
      `
define Hero with
  store hp = 10
  levelUp()
    self.hp = self.hp + 5
  end
end
`,
    );
    expect(errors).toEqual([]);
    // Store-keyed serialization: the class definition (its method) is
    // reconstructed at init, so it NEVER rides in the save — each
    // instance carries only its store props + a `defref` class name.
    const defs = (savedJson.match(/"levelUp"/g) ?? []).length;
    expect(defs).toBe(0);
    expect((savedJson.match(/"defref"/g) ?? []).length).toBe(3);
  });

  test("table.freeze state survives save/load", () => {
    const { errors, recorded } = roundTrip(
      `f = table.freeze({ 1, 2 })`,
      `host_record(table.isfrozen(f))
host_record(pcall(rawset, f, 1, 99))`,
    );
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, false]);
  });

  test("`#` border hints survive save/load", () => {
    const { errors, recorded } = roundTrip(
      `arr = table.create(10, 1)
arr[5] = nil`,
      `host_record(#arr)`,
    );
    expect(errors).toEqual([]);
    // Pre-save #arr is 10 (capacity fast path: slot [10] occupied).
    // Without the persisted capacity hint, a loaded table would walk
    // up from 0 and stop at the hole: 4.
    expect(recorded).toEqual([10]);
  });

  test("saving twice and loading twice keeps graphs independent", () => {
    const compiled = compileStory(
      storySource(
        `t = { n = 1 }
alias = t`,
        `alias.n = alias.n + 1
host_record(t.n)`,
      ),
    );
    const errors: string[] = [];
    const storyA = new RuntimeStory(compiled);
    storyA.BindExternalFunction("host_record", (v: unknown) => v, true);
    storyA.onError = (m: string) => errors.push(m);
    storyA.ContinueMaximally();

    // Two saves from the same state must be identical and
    // self-contained (per-writer memo — no cross-save id leakage).
    const save1 = storyA.state.ToJson() as string;
    const save2 = storyA.state.ToJson() as string;
    expect(save1).toBe(save2);

    const runCheck = (save: string): unknown[] => {
      const recorded: unknown[] = [];
      const storyB = new RuntimeStory(compiled);
      storyB.BindExternalFunction(
        "host_record",
        (v: unknown) => {
          recorded.push(v);
          return v;
        },
        true,
      );
      storyB.onError = (m: string) => errors.push(m);
      storyB.state.LoadJson(save);
      storyB.ChooseChoiceIndex(0);
      storyB.ContinueMaximally();
      return recorded;
    };

    // Each load is a fresh identity session over the same bytes —
    // aliasing intact both times, mutations independent.
    expect(runCheck(save1)).toEqual([2]);
    expect(runCheck(save2)).toEqual([2]);
    expect(errors).toEqual([]);
  });
});
