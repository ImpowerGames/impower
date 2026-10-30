import { describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";

function compileMultiFile(
  files: { rel: string; text: string }[],
): { errors: string[]; recorded: unknown[] } {
  const base = "inmemory://crossfile/";
  const compiler = testCompiler();
  compiler.configure({
    files: files.map((f) => ({
      uri: `${base}${f.rel}`,
      type: "script",
      name: f.rel.replace(/\.sd$/, ""),
      ext: "sd",
      text: f.text,
      version: 1,
      languageId: "sparkdown",
    })),
  });
  const result = compiler.compile({
    textDocument: { uri: `${base}main.sd` },
  });
  const errors: string[] = [];
  if (!result.program.chunks) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = testStory(result.program.chunks);
  const recorded: unknown[] = [];
  story.BindExternalFunction("host_record", (v: unknown) => {
    recorded.push(v);
    return v;
  });
  story.onError = (m: string) => errors.push(m);
  story.ContinueMaximally();
  return { errors, recorded };
}

describe("cross-file namespace scoping", () => {
  test("`new X()` in main resolves an X defined (as a leaf) in another script", () => {
    const { errors, recorded } = compileMultiFile([
      {
        rel: "includes/defs.sd",
        text: `define Base with
  store hp = 10
end
define Hero as Base with
  name = "Knight"
end
`,
      },
      {
        rel: "main.sd",
        text: `external host_record(v)
scene start
  & run()
  done
end
function run()
  local h = new Hero()
  host_record(h.hp)
  host_record(h.name)
end
`,
      },
    ]);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([10, "Knight"]);
  });

  test("`as X` in another script resolves an X defined (as a leaf) in main", () => {
    const { errors, recorded } = compileMultiFile([
      {
        rel: "includes/defs.sd",
        text: `define Hero as Actor with
  name = "Knight"
end
function run()
  host_record(Actor.Hero.name)
  host_record(Actor.Hero.hp)
end
`,
      },
      {
        rel: "main.sd",
        text: `external host_record(v)
define Actor as character with
  store hp = 7
end
scene start
  & run()
  done
end
`,
      },
    ]);
    expect(errors).toEqual([]);
    expect(recorded).toEqual(["Knight", 7]);
  });

  test("a leaf with NO cross-file type use is still scoped (bare name stays free)", () => {
    const { errors, recorded } = compileMultiFile([
      {
        rel: "includes/defs.sd",
        text: `define companion as character with
  store trust = 0
end
define Orion as companion with
  name = "Orion"
end
`,
      },
      {
        rel: "main.sd",
        text: `external host_record(v)
store Orion = 42
scene start
  & run()
  done
end
function run()
  host_record(Orion)
  host_record(companion.Orion.name)
end
`,
      },
    ]);
    expect(errors).toEqual([]);
    expect(recorded).toEqual([42, "Orion"]);
  });
});
