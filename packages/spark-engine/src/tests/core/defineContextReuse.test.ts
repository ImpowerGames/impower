// #654: the define tables a Game reads (character, config, animation, …) are
// converted out of the story's runtime `__def` tables every time a program
// arrives, which cost 14 to 20 ms in the worker's game and 12 to 16 ms again on
// the page for a project the size of Raffles and Bunny — on every keystroke,
// for an edit that changed no definition.
//
// A program carries the revision of the context it was compiled with, and the
// revision is keyed by every declaration a define's value can be computed from.
// A Game handed a program whose revision it already holds therefore keeps the
// tables it has. An edit that does change a definition moves the revision, and
// the new value has to reach the game's context.

import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Game } from "../../game/core/classes/Game";

const URI = "file:///main.sd";

const SOURCE = `define pace as config with
  speed = 5
end

define hero as character with
  name = "Hero"
end

-> start
scene start
:
  Action line.
hero:
  Line one of dialogue.
end
`;

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

const posAt = (text: string, offset: number) => {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length - 1, character: before.at(-1)!.length };
};

function makeCompiler(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
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
  } as never);
  return compiler;
}

function edit(
  compiler: SparkdownCompiler,
  text: string,
  find: string,
  replace: string,
  version: number,
): string {
  const offset = text.indexOf(find);
  expect(offset, `"${find}" is in the text`).toBeGreaterThanOrEqual(0);
  compiler.updateDocument({
    textDocument: { uri: URI, version },
    contentChanges: [
      {
        range: {
          start: posAt(text, offset),
          end: posAt(text, offset + find.length),
        },
        text: replace,
      },
    ],
  } as never);
  return text.slice(0, offset) + replace + text.slice(offset + find.length);
}

const compile = (compiler: SparkdownCompiler) =>
  quiet(() => compiler.compile({ textDocument: { uri: URI } }))
    .program as SparkProgram;

const makeGame = (program: SparkProgram) =>
  new Game({
    program,
    previewFrom: { file: URI, line: 0 },
    now: () => 0,
    setTimeout: ((fn: Function, ms?: number, ...args: any[]) => {
      if (ms != null && ms > 0) {
        return 0;
      }
      fn(...args);
      return 0;
    }) as never,
  } as never);

const builds = (game: Game) =>
  (game as unknown as { definesContextBuilds: number }).definesContextBuilds;

describe("a game receiving a program with an unchanged context (#654)", () => {
  it("keeps its define tables through an edit to a line of dialogue", () => {
    const compiler = makeCompiler(SOURCE);
    const first = compile(compiler);
    const game = quiet(() => makeGame(first));
    const buildsAfterConstruction = builds(game);
    expect(buildsAfterConstruction).toBeGreaterThan(0);
    const tablesBefore = (game.context as Record<string, unknown>)["character"];

    edit(
      compiler,
      SOURCE,
      "Line one of dialogue.",
      "Line one of dialogue, rewritten.",
      2,
    );
    const second = compile(compiler);
    expect(second.contextRevision).toBe(first.contextRevision);

    quiet(() => game.updateProgram(second));
    expect(builds(game)).toBe(buildsAfterConstruction);
    // The same tables, not merely equal ones.
    expect((game.context as Record<string, unknown>)["character"]).toBe(
      tablesBefore,
    );
    expect(
      (game.context as any)["character"]?.["hero"]?.["name"],
    ).toBe("Hero");
  });

  it("rebuilds them when a define's value changes, and the new value arrives", () => {
    const compiler = makeCompiler(SOURCE);
    const first = compile(compiler);
    const game = quiet(() => makeGame(first));
    const buildsAfterConstruction = builds(game);
    expect((game.context as any)["config"]?.["pace"]?.["speed"]).toBe(5);

    edit(compiler, SOURCE, "speed = 5", "speed = 9", 2);
    const second = compile(compiler);
    expect(second.contextRevision).not.toBe(first.contextRevision);

    quiet(() => game.updateProgram(second));
    expect(builds(game)).toBe(buildsAfterConstruction + 1);
    expect((game.context as any)["config"]?.["pace"]?.["speed"]).toBe(9);
  });

  it("never mistakes another compiler's first program for the one it holds", () => {
    // Each compiler stamps its revisions with an ordinal of its own, so a game
    // handed a program built by a second compiler rebuilds. Without that, two
    // producers would both call their first context revision the same thing,
    // and a define removed between them would keep rendering its old value.
    const first = compile(makeCompiler(SOURCE));
    const game = quiet(() => makeGame(first));
    const buildsAfterConstruction = builds(game);
    expect((game.context as any)["character"]?.["hero"]?.["name"]).toBe("Hero");

    const other = makeCompiler(SOURCE.replace(`  name = "Hero"\n`, ""));
    const second = compile(other);
    expect(second.contextRevision).not.toBe(first.contextRevision);

    quiet(() => game.updateProgram(second));
    expect(builds(game)).toBe(buildsAfterConstruction + 1);
    // A character defined without a `name` inherits the type default's empty
    // string, which is what the interpreter reads as "no name" and replaces
    // with the cue. Keeping the first program's tables would leave "Hero".
    expect((game.context as any)["character"]?.["hero"]?.["name"]).toBe("");
  });
});
