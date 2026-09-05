// #437 — a divert target may take a name the builtins prelude also uses,
// unless that name is a real runtime global.
//
// An unseeded compile (this harness, and the editor's diagnostics compiler)
// declares marker globals for the builtins so references such as
// `game.loading.percent` resolve. A marker captures every `-> name` divert as
// a divert through a variable, so the marker set must hold only names the
// seeded runtime really has: the type roots. The prelude's context is wider
// than that: it also lists every layout, style, and instance define under its
// bare name (`main` is a layout, a style, and a mixer; `red` a color; `title`
// a typewriter). Declaring those made `-> main` in every story that opens
// with `scene main` bind to a variable that never exists, and the story
// failed at its first step with "Tried to divert using a target from a
// variable that could not be found (main)" while the compile reported
// nothing.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import {
  collectDiagnostics,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";

const storyOpeningWith = (name: string) => `-> ${name}
scene ${name}
  Hello from ${name}.
  fin

end
`;

const URI = "inmemory:///main.sd";

// An unseeded compile of `text`, returning the program: the same mode as the
// harness, for cases that inspect the compiled output or the diagnostics'
// positions.
function compileUnseeded(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  return compiler.compile({ textDocument: { uri: URI } }).program;
}

function messagesOf(program: { diagnostics?: Record<string, any[]> }) {
  return Object.values(program.diagnostics ?? {})
    .flat()
    .map((d) => (typeof d.message === "string" ? d.message : d.message?.value));
}

function collisionsOf(program: { diagnostics?: Record<string, any[]> }) {
  return Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => String(d.message?.value ?? d.message).includes("is a builtin global"))
    .map((d) => ({
      message: String(d.message?.value ?? d.message),
      start: d.range.start,
      end: d.range.end,
    }));
}

describe("targets named after prelude entries that are not runtime globals", () => {
  // Each name is a prelude context entry: the `main` layout, mixer, and style;
  // the `loading` layout; the `red` color; the `title` typewriter; the `text`
  // style; the `assets` config instance. None is a bare runtime global (the
  // instances live on scoped `$<type>_<name>` keys), so a scene may use it.
  test.each(["main", "loading", "red", "title", "text", "assets"])(
    "`-> %s` reaches the scene of that name",
    (name) => {
      const ctx = makeRuntimeStoryFromSource(storyOpeningWith(name));
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.ContinueMaximally()).toBe(`Hello from ${name}.\n`);
    },
  );

  test("the divert is emitted as a direct path, not a variable divert", () => {
    const ctx = makeRuntimeStoryFromSource(storyOpeningWith("main"));
    const json = JSON.stringify(ctx.compiledJson);
    expect(json).toContain('{"->":"main"}');
    expect(json).not.toContain('{"->":"main","var":true}');
  });

  test("a scene may still be reached from a later divert, not only the opening one", () => {
    const ctx = makeRuntimeStoryFromSource(`-> start
scene start
  First.
  -> main

end
scene main
  Second.
  fin

end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("First.\nSecond.\n");
  });

  test("a label may take such a name too", () => {
    const ctx = makeRuntimeStoryFromSource(`-> start
scene start
  label main
  Hi.
  & i = i + 1
  if i < 2 then
    -> main
  end
  fin

end
store i = 0
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Hi.\nHi.\n");
  });
});

describe("the markers still make references to the builtins resolve", () => {
  // The mechanism the markers exist for: a reference through a type root
  // compiles clean in an unseeded compile, in a Sparkle binding (whose
  // position is token-precise, so a diagnostic there would be reported, not
  // hidden) as well as in a statement.
  test("`game.loading.percent` and `config.assets.predict_distance` compile clean", () => {
    const program = compileUnseeded(`layout loading with
  loading_content:
    text "Loading {game.loading.percent}% ahead {config.assets.predict_distance}"
end

scene A
  & local ahead = config.assets.predict_distance
  Hi.
  fin

end
`);
    expect(program.compiled).toBeTruthy();
    expect(messagesOf(program).filter((m) => m.includes("Cannot find"))).toEqual([]);
  });

  test("a bare instance name is not a global: `assets.predict_distance` warns", () => {
    // A seeded story fails at runtime on a bare `assets.predict_distance`
    // ("attempt to index a nil value"); `assets` is reached as
    // `config.assets`. The unseeded compile says so instead of hiding it
    // behind a marker.
    const program = compileUnseeded(`layout loading with
  loading_content:
    text "Ahead {assets.predict_distance}"
end

scene A
  Hi.
  fin

end
`);
    expect(
      messagesOf(program).some((m) =>
        m.includes("Cannot find item or path named `assets.predict_distance`"),
      ),
    ).toBe(true);
  });
});

describe("an authored define may take a builtin's name in an unseeded compile", () => {
  test("a root override replaces the marker and compiles", () => {
    const program = compileUnseeded(`define game with
  loading = { percent = 5 }
end

-> A
scene A
  {game.loading.percent}
  fin

end
`);
    expect(program.compiled).toBeTruthy();
    expect(messagesOf(program).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
    expect(messagesOf(program).filter((m) => m.includes("Cannot find"))).toEqual([]);
  });

  test("a leaf-instance override keeps its scoped key", () => {
    // `define red as color` scopes to `$color_red`; the markers must not
    // occupy that key, or the override is re-keyed to `$color_$color_red`.
    const program = compileUnseeded(`define red as color with
  value = "rgb(1,2,3)"
end

-> A
scene A
  Hi.
  fin

end
`);
    const json = JSON.stringify(program.compiled);
    expect(json).toContain('{"VAR=":"$color_red"}');
    expect(json).not.toContain("$color_$color_red");
    expect(messagesOf(program).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
  });

  test("a dual-typed name used as a type still produces a program", () => {
    // `define character as synth` keeps its bare name because `character` is
    // also used as a type, so it coexists with the `character` root under the
    // `$synth_character` key. That key must be free of markers, or the define
    // is registered nowhere and the whole story fails to serialize with no
    // diagnostic.
    const program = compileUnseeded(`define character as synth with
  wave = "sine"
end

define alice as character with
  name = "Alice"
end

-> start
scene start
  choose
    * A
      -> a
  end
end

scene a
  Chose A.
  fin

end
`);
    expect(program.compiled).toBeTruthy();
    expect(messagesOf(program).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
  });
});

describe("targets named after real builtin globals", () => {
  // `game`, `config`, `mixer`, and `world` are type roots: the seeded runtime
  // holds a table under each bare name, so `-> game` binds to that table in
  // every compile and can never reach a scene. The unseeded compile says so
  // instead of failing silently at runtime.
  test.each(["game", "config", "mixer", "world"])(
    "`scene %s` is reported as colliding with a builtin global",
    (name) => {
      const { errorMessages } = collectDiagnostics(storyOpeningWith(name));
      expect(
        errorMessages.some(
          (m) =>
            m.includes(`\`${name}\` is a builtin global`) &&
            m.includes("scene, branch, function, or label"),
        ),
      ).toBe(true);
    },
  );

  test("the report covers the scene's name on its declaration line", () => {
    const program = compileUnseeded(storyOpeningWith("game"));
    expect(collisionsOf(program)).toEqual([
      {
        message:
          "`game` is a builtin global, so it cannot also be the name of a scene, branch, function, or label",
        start: { line: 1, character: 6 },
        end: { line: 1, character: 10 },
      },
    ]);
  });

  test("a function's report covers its name, not its body", () => {
    const program = compileUnseeded(`-> A
function game()
  local x = 1
  return x
end
scene A
  Hi.
  fin

end
`);
    expect(collisionsOf(program).map((c) => [c.start, c.end])).toEqual([
      [
        { line: 1, character: 9 },
        { line: 1, character: 13 },
      ],
    ]);
  });

  test("a label named after a builtin global is reported", () => {
    const program = compileUnseeded(`-> start
scene start
  label game
  Hi.
  -> game

end
`);
    expect(collisionsOf(program).map((c) => [c.start, c.end])).toEqual([
      [
        { line: 2, character: 8 },
        { line: 2, character: 12 },
      ],
    ]);
  });

  test("both of two scenes sharing a builtin's name are reported", () => {
    const program = compileUnseeded(`-> game
scene game
  A.
  fin

end
scene game
  B.
  fin

end
`);
    expect(collisionsOf(program).map((c) => c.start.line)).toEqual([1, 6]);
  });

  test("a scene with an unrelated name draws no such diagnostic", () => {
    const { errorMessages } = collectDiagnostics(storyOpeningWith("start"));
    expect(errorMessages).toEqual([]);
  });

  test("the report follows an edit on one compiler", () => {
    const compiler = new SparkdownCompiler();
    const file = (text: string, version: number) => ({
      uri: URI,
      type: "script" as const,
      name: "main",
      ext: "sd",
      text,
      version,
      languageId: "sparkdown",
    });
    compiler.configure({ files: [file(storyOpeningWith("start"), 1)] });
    expect(
      collisionsOf(compiler.compile({ textDocument: { uri: URI } }).program),
    ).toEqual([]);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ text: storyOpeningWith("game") }],
    });
    expect(
      collisionsOf(compiler.compile({ textDocument: { uri: URI } }).program),
    ).toHaveLength(1);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [{ text: storyOpeningWith("start") }],
    });
    expect(
      collisionsOf(compiler.compile({ textDocument: { uri: URI } }).program),
    ).toEqual([]);
  });
});
