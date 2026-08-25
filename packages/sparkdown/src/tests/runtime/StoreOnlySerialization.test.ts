// Store-keyed define serialization: ONLY `store`-marked state persists.
// Everything else (type tables, methods, non-store props, the UI structs)
// is reconstructed by re-running the definition at init; saved define
// references restore their class link by NAME.
//
// Design (confirmed 2026-06-13):
//   - named define globals (define X / type tables) → write only the
//     changed `store` delta; merge it onto the init-reconstructed default
//     on load (so own non-store props like `name` survive).
//   - `new` instances → write store props + `{defref: <ClassName>}`; on
//     load, create fresh + relink __index to the LIVE class global.
//   - a define with no store state writes nothing.
//
// Run: npx vitest run .../StoreOnlySerialization.test.ts

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
  if (!result.program.compiled) throw new Error("compile failed");
  return result.program.compiled as Record<string, any>;
}

function storySource(setupBody: string, checkBody: string, prelude = ""): string {
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

function roundTrip(setupBody: string, checkBody: string, prelude = "") {
  const compiled = compileStory(storySource(setupBody, checkBody, prelude));
  const errors: string[] = [];
  const storyA = new RuntimeStory(compiled);
  storyA.BindExternalFunction("host_record", (v: unknown) => v, true);
  storyA.onError = (m: string) => errors.push(`[setup] ${m}`);
  storyA.ContinueMaximally();
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
  storyB.ContinueMaximally();
  return { errors, recorded, savedJson };
}

const HERO = `
define Hero with
  store hp = 10
  title = "wanderer"
  levelUp()
    self.hp = self.hp + 5
  end
end
`;

describe("store-only · new instances", () => {
  test("class identity restored to the LIVE global type after load", () => {
    const { errors, recorded } = roundTrip(
      `h = new Hero()
h:levelUp()`,
      `host_record(rawequal(getmetatable(h).__index, Hero))
host_record(h.hp)
host_record(h.title)`,
      HERO,
    );
    expect(errors).toEqual([]);
    expect(recorded).toEqual([true, 15, "wanderer"]);
  });

  test("save carries no class definition (methods/non-store props)", () => {
    const { errors, savedJson } = roundTrip(`h = new Hero()`, `host_record(h.hp)`, HERO);
    expect(errors).toEqual([]);
    // The class method and the non-store default are reconstructed by
    // init — they must NOT appear in the save.
    expect(savedJson).not.toContain("levelUp");
    expect(savedJson).not.toContain("wanderer");
    // The store prop's class reference is by name.
    expect(savedJson).toContain("Hero");
  });
});

describe("store-only · named define globals", () => {
  test("store change persists; own non-store prop survives via merge", () => {
    const { errors, recorded } = roundTrip(
      `companion.O.trust = companion.O.trust - 1`,
      `host_record(companion.O.trust)
host_record(companion.O.name)`,
      `
define companion with
  store trust = 5
end
define O as companion with
  name = "Orion"
end
`,
    );
    expect(errors).toEqual([]);
    expect(recorded).toEqual([4, "Orion"]);
  });

  // Namespace-scoping (P4 verification): a leaf-instance define now binds a
  // synthetic `$<type>_<name>` global instead of the bare name. Save/load must
  // be transparent to that — `defself` merges by GLOBAL KEY (not the name),
  // and `defref` relinks via the class NAME which is always a bare type. This
  // round-trip stresses both paths plus grandparent-qualified access at once.
  // See project_define_namespace_scoping.
  test("scoped leaf instance + new-instance of a type both survive one round-trip", () => {
    const { errors, recorded } = roundTrip(
      `companion.O.trust = 1
inst = new companion()
inst.trust = 9`,
      `host_record(companion.O.trust)
host_record(companion.O.name)
host_record(character.O.name)
host_record(inst.trust)
host_record(rawequal(getmetatable(inst).__index, companion))`,
      `
define companion as character with
  store trust = 5
end
define O as companion with
  name = "Orion"
end
`,
    );
    expect(errors).toEqual([]);
    expect(recorded).toEqual([
      1, // leaf `$companion_O` store delta merged by global key (defself)
      "Orion", // leaf non-store prop reconstructed at init, survives merge
      "Orion", // grandparent-qualified access resolves the scoped instance
      9, // `new companion()` store prop survived (defref instance)
      true, // defref relinked __index to the live bare `companion` type
    ]);
  });

  test("a define with no store props contributes nothing to the save", () => {
    const { errors, savedJson } = roundTrip(
      `local _ = 1`,
      `host_record(true)`,
      `
define Widget with
  secret = "do-not-save"
  color = "red"
end
`,
    );
    expect(errors).toEqual([]);
    // Widget has no store props → fully reconstructed by init, never saved.
    expect(savedJson).not.toContain("do-not-save");
  });
});
