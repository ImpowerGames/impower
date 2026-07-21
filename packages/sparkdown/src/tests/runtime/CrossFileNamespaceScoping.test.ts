// Cross-file namespace scoping (P1, whole-program post-pass). Leaf-vs-type
// classification is a whole-PROGRAM property: a `define X` in one file whose
// name is used as a TYPE (`new X()` / `as X`) only in a DIFFERENT included file
// must stay on its bare global. Per-document lowering can't see across files;
// the `scopeDefineInstances` post-pass in SparkdownCompiler runs after the whole
// program is assembled, over the union of type names from every file, so it can.
//
// Without the cross-file pass, `X` looks like a leaf in its own file, gets
// scoped to `$Type_X`, and the `new X()` / `as X` site in the other file
// resolves the bare `X` to nil — a crash / "cannot find" error. These tests
// would fail on the old per-document classification. See
// project_define_namespace_scoping.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

function compileMultiFile(
  files: { rel: string; text: string }[],
): { errors: string[]; recorded: unknown[] } {
  const base = "inmemory://crossfile/";
  const compiler = new SparkdownCompiler();
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
  if (!result.program.compiled) {
    return { errors: ["NO_COMPILED"], recorded: [] };
  }
  const story = new RuntimeStory(result.program.compiled as Record<string, any>);
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
  test("`new X()` in main resolves an X defined (as a leaf) in an include", () => {
    // `Hero` is `as Base` in the include with no local type use → looks like a
    // leaf there. `new Hero()` in main makes it a TYPE program-wide, so it must
    // keep its bare global.
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
include includes/defs.sd
& run()
done
function run()
  local h = new Hero()
  host_record(h.hp)
  host_record(h.name)
end
`,
      },
    ]);
    expect(errors).toEqual([]);
    // hp inherited from Base, name is Hero's own — proves `new Hero()` found
    // the bare `Hero` type and minted a fresh instance.
    expect(recorded).toEqual([10, "Knight"]);
  });

  test("`as X` in main resolves an X defined (as a leaf) in an include", () => {
    // `Actor` is `as character` in the include with no local type use → looks
    // like a leaf. Main uses it as a parent (`as Actor`) AND as a member root
    // (`Actor.Hero`), both of which need the bare `Actor` global.
    const { errors, recorded } = compileMultiFile([
      {
        rel: "includes/defs.sd",
        text: `define Actor as character with
  store hp = 7
end
`,
      },
      {
        rel: "main.sd",
        text: `external host_record(v)
include includes/defs.sd
define Hero as Actor with
  name = "Knight"
end
& run()
done
function run()
  host_record(Actor.Hero.name)
  host_record(Actor.Hero.hp)
end
`,
      },
    ]);
    expect(errors).toEqual([]);
    // `Actor.Hero` resolves through the bare `Actor` type table; hp inherited.
    expect(recorded).toEqual(["Knight", 7]);
  });

  test("a leaf with NO cross-file type use is still scoped (bare name stays free)", () => {
    // `Orion` is `as companion` and never used as a type in ANY file → leaf →
    // scoped `$companion_Orion`, so the bare name `Orion` is free for a user
    // var. `companion.Orion` still resolves (that goes through the type table).
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
include includes/defs.sd
store Orion = 42
& run()
done
function run()
  host_record(Orion)
  host_record(companion.Orion.name)
end
`,
      },
    ]);
    expect(errors).toEqual([]);
    // Bare `Orion` is the user's store var (42); the define is reached longform.
    expect(recorded).toEqual([42, "Orion"]);
  });
});
