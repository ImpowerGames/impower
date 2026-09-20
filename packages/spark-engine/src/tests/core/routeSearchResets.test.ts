// What the preview's route search costs before it has advanced the story at
// all, and what it leaves behind when it is done (#650).
//
// Every reset re-runs the `global decl` container, which evaluates every
// global definition in the project — the builtins seeded into the story
// included. A search that resets a story nobody has touched, and again on its
// way out to a caller that is about to load a state of its own, pays that
// whole cost twice for nothing.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { planRoute } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { Game } from "../../game/core/classes/Game";

const URI = "inmemory:///main.sd";

const SRC = `store score = 0

-> start

scene start
  First line here.
  & score = 10
  Second line here.
  & score = 20
  Third line here.
end
`;
const TARGET_LINE = 9; // "Third line here.", counting from zero

function compileSrc(src: string) {
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
        text: src,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: URI },
    countAllVisits: true,
  });
  if (!result.program.compiled) {
    throw new Error("route-reset fixture failed to compile");
  }
  return result.program;
}

function newGame(program: unknown) {
  return new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
}

/** Count `ResetGlobals` on this one story, and report the count so far. */
function countGlobalEvaluations(game: Game): () => number {
  const story = game.story as any;
  let count = 0;
  const original = story.ResetGlobals.bind(story);
  story.ResetGlobals = (...args: unknown[]) => {
    count += 1;
    return original(...args);
  };
  return () => count;
}

function planTo(game: Game, program: any, line: number) {
  game.setStartFrom({ file: URI, line });
  const toPath = (game as any).startPath as string;
  const fromPath = Game.getSimulateFromPath(toPath);
  // As the player's worker asks for it: the replay that follows installs a
  // state of its own.
  return Game.planRoute(game.story, program, fromPath, toPath, undefined, {
    callerResetsStory: true,
  });
}

describe("route search resets (#650)", () => {
  test("a search and its replay evaluate the globals once", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    // Counted from the story the compile handed over, which was constructed
    // and reset moments earlier: the search inherits a story whose globals are
    // already evaluated, and the replay that follows a found route installs a
    // state of its own.
    const evaluations = countGlobalEvaluations(game);

    const route = planTo(game, program, TARGET_LINE);
    expect(route).not.toBeNull();
    game.patchAndSimulateRoute(route!);

    expect(game.simulation).toBe("success");
    expect(evaluations()).toBe(1);
  });

  test("a search on a story that has been advanced evaluates the globals", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    // Advance the story, so its variables no longer hold what a fresh
    // evaluation would give them.
    game.story.ChoosePathString("start");
    game.story.Continue();
    (game.story.variablesState as any).$set?.("score", 999);

    const evaluations = countGlobalEvaluations(game);
    const route = planTo(game, program, TARGET_LINE);

    expect(route).not.toBeNull();
    expect(evaluations()).toBeGreaterThanOrEqual(1);
  });

  test("a search that finds no route leaves the story reset", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    game.story.ChoosePathString("start");
    game.story.Continue();

    const route = planRoute(game.story, "start", "start.NO_SUCH_PATH", {
      callerResetsStory: true,
    });

    expect(route).toBeNull();
    // A reset story is back at the very beginning: nothing has been visited
    // and the first line is still ahead of it.
    expect(
      (game.story.state as any).VisitCountAtPathString("start"),
    ).toBe(0);
    expect(game.story.canContinue).toBe(true);
  });

  test("a search that throws leaves the story usable", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    const story = game.story as any;
    const hookBefore = story.onExecute;
    const originalChoosePathString = story.ChoosePathString.bind(story);
    let thrown = false;
    story.ChoosePathString = () => {
      thrown = true;
      story.ChoosePathString = originalChoosePathString;
      throw new Error("planted failure inside the search");
    };

    expect(() =>
      planRoute(game.story, "start", "start.NO_SUCH_PATH", {
        callerResetsStory: true,
      }),
    ).toThrow("planted failure inside the search");
    expect(thrown).toBe(true);

    // The story still runs, and the hooks the search replaced are its own
    // again.
    expect(story.onExecute).toBe(hookBefore);
    game.story.ChoosePathString("start");
    expect(game.story.Continue()?.trim()).toBe("First line here.");
  });
});
