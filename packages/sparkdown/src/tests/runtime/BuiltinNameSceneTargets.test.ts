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

const scriptFile = (text: string, version: number) => ({
  uri: URI,
  type: "script" as const,
  name: "main",
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

// An unseeded compile of `text`, returning the program: the same mode as the
// harness, for cases that inspect the compiled output or the diagnostics'
// positions.
function compileUnseeded(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [scriptFile(text, 1)] });
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
    .filter((d) => /builtin global/.test(String(d.message?.value ?? d.message)))
    .map((d) => ({
      message: String(d.message?.value ?? d.message),
      start: d.range.start,
      end: d.range.end,
    }));
}

const SCENE_MESSAGE = (name: string) =>
  `\`${name}\` is a builtin global, so it cannot also be the name of a scene or function`;
const DIVERT_MESSAGE = (name: string) =>
  `\`${name}\` is a builtin global, so this divert binds to it and cannot reach a scene, branch, or label named \`${name}\``;
const DIVERT_WARNING = (name: string) =>
  `\`${name}\` is a builtin global; unless a \`${name}\` declared in this flow holds a divert target when this divert runs, it binds to the builtin and cannot reach a scene, branch, or label named \`${name}\``;

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
  // compiles clean in an unseeded compile. The references sit in a Sparkle
  // binding, where a missing name is reported; a reference in display text
  // is not checked at compile time.
  test("`game.loading.percent` and `config.assets.predict_distance` compile clean", () => {
    const program = compileUnseeded(`layout loading with
  loading_content:
    text "Loading {game.loading.percent}% ahead {config.assets.predict_distance}"
end

scene A
  & local ahead = 1 + config.assets.predict_distance
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
    // The marker is dropped from the registry and the authored define takes
    // the slot. (A seeded compile of the same source fails on a duplicate
    // identifier between the prelude's `game` and the authored one; that is
    // #454, and independent of the markers.)
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

describe("scenes and functions named after real builtin globals", () => {
  // `game`, `config`, `mixer`, and `world` are type roots: the seeded runtime
  // holds a table under each bare name, so `-> game` binds to that table in
  // every compile and can never reach a scene. The unseeded compile says so
  // instead of failing silently at runtime.
  test.each(["game", "config", "mixer", "world"])(
    "`scene %s` is reported as colliding with a builtin global",
    (name) => {
      const { errorMessages } = collectDiagnostics(storyOpeningWith(name));
      expect(errorMessages).toContain(SCENE_MESSAGE(name));
    },
  );

  test("the scene's report covers its name, and the opening divert is reported too", () => {
    const program = compileUnseeded(storyOpeningWith("game"));
    expect(collisionsOf(program)).toEqual([
      {
        message: SCENE_MESSAGE("game"),
        start: { line: 1, character: 6 },
        end: { line: 1, character: 10 },
      },
      {
        message: DIVERT_MESSAGE("game"),
        start: { line: 0, character: 3 },
        end: { line: 0, character: 7 },
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
    expect(
      collisionsOf(program)
        .filter((c) => c.message === SCENE_MESSAGE("game"))
        .map((c) => [c.start, c.end]),
    ).toEqual([
      [
        { line: 1, character: 9 },
        { line: 1, character: 13 },
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
    expect(
      collisionsOf(program)
        .filter((c) => c.message === SCENE_MESSAGE("game"))
        .map((c) => c.start.line),
    ).toEqual([1, 6]);
  });

  test("a scene still named after a builtin global is reported when an authored define took the marker's slot", () => {
    const program = compileUnseeded(`define game with
  loading = { percent = 5 }
end

-> game
scene game
  Hi.
  fin

end
`);
    expect(collisionsOf(program).map((c) => c.message)).toEqual([
      SCENE_MESSAGE("game"),
      DIVERT_MESSAGE("game"),
    ]);
  });

  test("a scene with an unrelated name draws no such diagnostic", () => {
    const { errorMessages } = collectDiagnostics(storyOpeningWith("start"));
    expect(errorMessages).toEqual([]);
  });
});

describe("diverts captured by a builtin global", () => {
  // A label or branch named after a builtin global is fine in itself: it is
  // reached by its qualified path, or never diverted to, and the seeded
  // compile says nothing about it. What breaks in every compile is a bare
  // `-> name`, which binds to the global's table; that divert is reported,
  // on the name it uses.
  test("a bare divert to a label named after a builtin global is reported at the divert", () => {
    const program = compileUnseeded(`-> start
scene start
  label game
  Hi.
  -> game

end
`);
    expect(collisionsOf(program)).toEqual([
      {
        message: DIVERT_MESSAGE("game"),
        start: { line: 4, character: 5 },
        end: { line: 4, character: 9 },
      },
    ]);
  });

  test("a bare divert to a branch named after a builtin global is reported, even under an authored override", () => {
    const program = compileUnseeded(`define game with
  loading = { percent = 5 }
end

-> start
scene start
  Hi.
  -> game
  branch game
    Nested.
    fin
  end
end
`);
    expect(collisionsOf(program)).toEqual([
      {
        message: DIVERT_MESSAGE("game"),
        start: { line: 7, character: 5 },
        end: { line: 7, character: 9 },
      },
    ]);
  });

  test("a label that is only a gather anchor draws no diagnostic", () => {
    const ctx = makeRuntimeStoryFromSource(`-> s
scene s
  Before.
  label world
  After.
  fin

end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Before.\nAfter.\n");
  });

  test("a branch reached by its qualified path draws no diagnostic", () => {
    const ctx = makeRuntimeStoryFromSource(`-> s.world
scene s
  branch world
    Nested.
    fin
  end
end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Nested.\n");
  });

  test("the report sits on the divert's target, not on the same word earlier in the line", () => {
    const program = compileUnseeded(`-> start
scene start
  choose
    + Play game -> game
  end

end
`);
    expect(collisionsOf(program).map((c) => [c.start, c.end])).toEqual([
      [
        { line: 3, character: 19 },
        { line: 3, character: 23 },
      ],
    ]);
  });

  test("a call-form divert (`-> game(5)`) is reported on its target", () => {
    const program = compileUnseeded(`-> start
scene start
  -> game(5)

end
`);
    expect(collisionsOf(program).map((c) => [c.start, c.end])).toEqual([
      [
        { line: 2, character: 5 },
        { line: 2, character: 9 },
      ],
    ]);
  });

  test("two diverts to the same builtin global on one line are both reported", () => {
    const program = compileUnseeded(`-> start
scene start
  -> game -> game

end
`);
    expect(collisionsOf(program).map((c) => c.start.character)).toEqual([5, 13]);
  });

  test("a Luau call to a builtin global's name is not a divert and draws no divert report", () => {
    // `color("red")` lowers to a divert too, but it names no scene, branch,
    // or label; whatever it does at runtime is not this report's subject.
    const program = compileUnseeded(`-> start
scene start
  & local c = color("red")
  Hi.
  fin

end
`);
    expect(collisionsOf(program)).toEqual([]);
  });

  test("a parameter of an enclosing scene used from its branch is a warning, and the story runs when entered at the head", () => {
    const ctx = makeRuntimeStoryFromSource(`-> start
scene start
  -> go(-> there)

end
scene go(game)
  -> go.inner
  branch inner
    -> game
  end
end
scene there
  Arrived.
  fin

end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toContain(DIVERT_WARNING("game"));
    expect(ctx.story.ContinueMaximally()).toBe("Arrived.\n");
  });

  test("a local declared in a sibling branch of the same scene also counts as the author's", () => {
    // At runtime both branches run in one call-stack element, so the local
    // set in `one` is visible to the divert in `two`.
    const ctx = makeRuntimeStoryFromSource(`-> s
scene s
  -> s.one
  branch one
    & local game = -> there
    -> s.two
  end
  branch two
    -> game
  end
end
scene there
  Arrived.
  fin

end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Arrived.\n");
  });

  test("a sibling branch's local that may not have run downgrades the report to a warning", () => {
    // Entering `two` directly leaves `one`'s local unset, and the divert then
    // binds to the builtin at runtime; entering through `one` first would
    // make it work. The compile cannot tell which, so it warns.
    const program = compileUnseeded(`-> s.two
scene s
  branch one
    & local game = -> there
    fin
  end
  branch two
    -> game
  end
end
scene there
  Arrived.
  fin

end
`);
    const all: any[] = Object.values(program.diagnostics ?? {}).flat();
    const reports = all.filter((d) => /builtin global/.test(String(d.message?.value ?? d.message)));
    expect(reports.map((d) => [d.severity, d.range.start])).toEqual([
      [2, { line: 7, character: 7 }],
    ]);
    expect(String(reports[0].message?.value)).toBe(DIVERT_WARNING("game"));
  });

  test("a local declared after the divert in the same flow is a warning, not silence", () => {
    // The divert always runs before the declaration, so the story dies; the
    // compile cannot see order, but it can see that the name is declared
    // rather than absent, and says so at warning level.
    const program = compileUnseeded(`-> s
scene s
  -> game
  & local game = -> there
  fin

end
scene there
  Arrived.
  fin

end
`);
    const all: any[] = Object.values(program.diagnostics ?? {}).flat();
    const reports = all.filter((d) => /builtin global/.test(String(d.message?.value ?? d.message)));
    expect(reports.map((d) => [d.severity, d.range.start])).toEqual([
      [2, { line: 2, character: 5 }],
    ]);
  });

  test("a local of an enclosing scene used from its branch is a warning, and the story runs when the local was set", () => {
    const source = `-> s
scene s
  & local game = -> there
  -> s.inner
  branch inner
    -> game
  end
end
scene there
  Arrived.
  fin

end
`;
    const all: any[] = Object.values(compileUnseeded(source).diagnostics ?? {}).flat();
    expect(
      all.filter((d) => /builtin global/.test(String(d.message?.value ?? d.message))).map((d) => d.severity),
    ).toEqual([2]);
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Arrived.\n");
  });

  test("a divert inside a nested closure with the enclosing function's local is a warning", () => {
    // Whether the closure captured `outer`'s local is not modelled; the
    // declaration exists in the same top-level flow, so the report is a
    // warning. (The divert-target literal keeps this story from
    // serializing, which is #457 and independent of the report; the
    // diagnostics come first.)
    const program = compileUnseeded(`-> start
scene start
  & outer()
  fin

end
function outer()
  local game = -> there
  local inner = function()
    local x = -> game
    return x
  end
  return inner
end
scene there
  Arrived.
  fin

end
`);
    expect(collisionsOf(program).map((c) => c.message)).toEqual([DIVERT_WARNING("game")]);
  });

  test("a local inside a nested function makes the enclosing function's divert a warning, not silence", () => {
    // The nested function's local can never be visible to `outer`, so this
    // story fails; the report cannot tell that apart from a captured local
    // and warns, which is the level a declaration anywhere in the flow gets.
    // (The divert-target literal keeps this story from serializing, which
    // is #457 and independent of the report; the diagnostics come first.)
    const program = compileUnseeded(`-> start
scene start
  & outer()
  fin

end
function outer()
  local inner = function()
    local game = -> there
    return 1
  end
  local f = -> game
  return f
end
scene there
  Arrived.
  fin

end
`);
    expect(collisionsOf(program).map((c) => c.message)).toEqual([DIVERT_WARNING("game")]);
  });

  test("a dotted divert target in an expression keeps its segments in source order", () => {
    const ctx = makeRuntimeStoryFromSource(`-> start
scene start
  & local f = -> there.inner
  -> f

end
scene there
  branch inner
    Arrived.
    fin
  end
end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Arrived.\n");
  });

  test("`target not found` covers the whole path now that its identifiers carry positions", () => {
    const program = compileUnseeded(`-> start
scene start
  -> start.nowhere

end
`);
    const notFound = Object.values(program.diagnostics ?? {})
      .flat()
      .filter((d: any) => String(d.message?.value ?? d.message).includes("target not found"))
      .map((d: any) => [d.range.start, d.range.end]);
    expect(notFound).toEqual([
      [
        { line: 2, character: 5 },
        { line: 2, character: 18 },
      ],
    ]);
  });

  test("a parameter of the divert's own flow is a warning, and the story runs when entered at the head", () => {
    // A parameter is bound at the flow's head, not when the flow is entered
    // at a label, so even this shape is reported, at warning level.
    const ctx = makeRuntimeStoryFromSource(`-> start
scene start
  -> go(-> there)

end
scene go(game)
  -> game

end
scene there
  Arrived.
  fin

end
`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.warningMessages).toContain(DIVERT_WARNING("game"));
    expect(ctx.story.ContinueMaximally()).toBe("Arrived.\n");
  });

  test("the report follows range edits on one compiler", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [scriptFile(storyOpeningWith("start"), 1)] });
    expect(
      collisionsOf(compiler.compile({ textDocument: { uri: URI } }).program),
    ).toEqual([]);
    // `start` → `game` on the divert line and the scene line, as two range
    // edits, so the rest of the document is carried forward.
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: { start: { line: 0, character: 3 }, end: { line: 0, character: 8 } },
          text: "game",
        },
        {
          range: { start: { line: 1, character: 6 }, end: { line: 1, character: 11 } },
          text: "game",
        },
      ],
    });
    expect(
      collisionsOf(compiler.compile({ textDocument: { uri: URI } }).program).map(
        (c) => c.message,
      ),
    ).toEqual([SCENE_MESSAGE("game"), DIVERT_MESSAGE("game")]);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 3 },
      contentChanges: [
        {
          range: { start: { line: 0, character: 3 }, end: { line: 0, character: 7 } },
          text: "start",
        },
        {
          range: { start: { line: 1, character: 6 }, end: { line: 1, character: 10 } },
          text: "start",
        },
      ],
    });
    expect(
      collisionsOf(compiler.compile({ textDocument: { uri: URI } }).program),
    ).toEqual([]);
  });
});
