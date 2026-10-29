import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import type { ProgramRoot } from "../../program/ProgramRoot";

function compileStory(source: string): ProgramRoot {
  const compiler = testCompiler();
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
  if (!result.program.chunks) throw new Error("compile failed");
  return result.program.chunks;
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
  const storyA = testStory(compiled);
  storyA.BindExternalFunction("host_record", (v: unknown) => v);
  storyA.onError = (m: string) => errors.push(`[setup] ${m}`);
  storyA.ContinueMaximally();
  const savedJson = storyA.state.ToJson() as string;

  const storyB = testStory(compiled);
  const recorded: unknown[] = [];
  storyB.BindExternalFunction(
    "host_record",
    (v: unknown) => {
      recorded.push(v);
      return v;
    },
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
    expect(savedJson).not.toContain("levelUp");
    expect(savedJson).not.toContain("wanderer");
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
      1,
      "Orion",
      "Orion",
      9,
      true,
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
    expect(savedJson).not.toContain("do-not-save");
  });
});
