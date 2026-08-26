// #379 — when a preview cannot be simulated, WHY it could not.
//
// The status bar has always shown that a preview failed: the row turns red and
// puts a `🞪` between the line the search started from and the line the author
// asked for. It has never said why, and it could not, because everything that
// gives up throws away the same empty answer.
//
// Three causes reach that row and they want three different things from the
// author:
//
//   - the search hit a ceiling and stopped looking, so whether a route exists
//     is still unknown ("timeout");
//   - the search looked everywhere it could and never arrived ("exhausted");
//   - the line is not part of the story flow, so there was never a route to
//     look for ("unroutable").
//
// What must hold:
//   - the planner reports which of those happened, and reports "found" when it
//     succeeded;
//   - a target that is not in the story is called unroutable no matter which
//     ceiling the doomed search happened to stop on;
//   - the whole chain, from a real search to the word the status bar uses,
//     agrees.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  lastSearchStats,
  planRoute,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import { Game } from "../../game/core/classes/Game";

const URI = "inmemory:///main.sd";

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
  } as never);
  const result = compiler.compile({
    textDocument: { uri: URI },
    countAllVisits: true,
  });
  if (!result.program.compiled) {
    throw new Error("fixture failed to compile");
  }
  return result.program;
}

const newGame = (program: unknown) =>
  new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

/** A scene whose tail sits after an unconditional divert away, so the tail has
 *  a real place in the script that no route through the scene ever reaches. */
const UNREACHABLE_TAIL = `-> start

scene start
  First beat.
  -> other
  Nothing ever reaches this line.
end

scene other
  Elsewhere.
end
`;

/** No story flow at all: every line is part of a definition, so no line in the
 *  file resolves to a routable position. */
const NO_STORY_FLOW = `define config.thing:
  value = 1
`;

/** A scene that diverts back to its own top forever. */
const ENDLESS_LOOP = `-> start

scene start
  Going round.
  -> start
end
`;

/** A plain scene of `beats` lines, reachable end to end. */
function plainScene(beats: number): string {
  const lines = ["-> start", "", "scene start"];
  for (let i = 0; i < beats; i += 1) {
    lines.push(`  Beat number ${i}.`);
  }
  lines.push("end", "");
  return lines.join("\n");
}

/** Resolve a source line the way a click in the editor would. */
function startPathForLine(program: unknown, line: number): string {
  const game: any = newGame(program);
  game.setStartFrom({ file: URI, line });
  return game.startPath as string;
}

describe("the planner says how its search ended", () => {
  test("a search that reaches the target reports that it found it", () => {
    const program = compileSrc(plainScene(40));
    const toPath = startPathForLine(program, 40);
    const route = Game.planRoute(newGame(program).story, program, "start", toPath);
    expect(route).not.toBeNull();
    expect(lastSearchStats.endReason).toBe("found");
    expect(lastSearchStats.exhaustedBudget).toBe(false);
  }, 120_000);

  test("a search that runs the story out reports that it was exhausted", () => {
    const program = compileSrc(UNREACHABLE_TAIL);
    const toPath = startPathForLine(program, 5);
    // The line really is in the script — this is not a missing-target search.
    expect(program.pathLocations?.[toPath]).toBeTruthy();
    const route = Game.planRoute(newGame(program).story, program, "start", toPath);
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("exhausted");
    expect(lastSearchStats.exhaustedBudget).toBe(false);
  }, 120_000);

  test("a search stopped by a ceiling names the ceiling that stopped it", () => {
    const program = compileSrc(ENDLESS_LOOP);
    const route = planRoute(
      newGame(program).story,
      "start",
      "start.NO_SUCH_PATH",
      {
        stayWithinKnot: true,
        maxSteps: 5_000,
        maxNodes: 500,
        // The assertion is about the work ceiling, so the wall clock must not
        // be able to reach the finish line first on a slow machine.
        searchTimeout: Number.MAX_SAFE_INTEGER,
      },
    );
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("max-steps");
    expect(lastSearchStats.exhaustedBudget).toBe(true);
  }, 120_000);

  test("the wall-clock backstop is reported apart from the work ceilings", () => {
    const program = compileSrc(ENDLESS_LOOP);
    const route = planRoute(
      newGame(program).story,
      "start",
      "start.NO_SUCH_PATH",
      {
        stayWithinKnot: true,
        // Room to spare on both work ceilings, so only the clock can stop it.
        maxSteps: Number.MAX_SAFE_INTEGER,
        maxNodes: Number.MAX_SAFE_INTEGER,
        searchTimeout: 50,
      },
    );
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("timeout");
    expect(lastSearchStats.exhaustedBudget).toBe(true);
  }, 120_000);
});

describe("the planner's verdict becomes the reason shown to the author", () => {
  test("a ceiling of any kind is reported as having run out of time", () => {
    const program = compileSrc(ENDLESS_LOOP);
    // A real search, really cut off, immediately before the question is asked —
    // the same order the engine does it in.
    planRoute(newGame(program).story, "start", "start.NO_SUCH_PATH", {
      stayWithinKnot: true,
      maxSteps: 5_000,
      maxNodes: 500,
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    expect(lastSearchStats.endReason).toBe("max-steps");
    const realTarget = startPathForLine(program, 3);
    expect(Game.describeFailedRouteSearch(program, realTarget)).toBe("timeout");
  }, 120_000);

  test("a target that is not in the story is unroutable, whatever ended the search", () => {
    // This is the case a naive reading gets wrong. The line an author clicks in
    // front matter or a `define` block resolves to no story position, the
    // search that then runs is looking for something that was never there, and
    // reporting whichever ceiling it stopped on would tell them to shorten a
    // scene that is not the problem.
    const program = compileSrc(ENDLESS_LOOP);
    planRoute(newGame(program).story, "start", "start.NO_SUCH_PATH", {
      stayWithinKnot: true,
      maxSteps: 5_000,
      maxNodes: 500,
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    expect(lastSearchStats.endReason).toBe("max-steps");
    expect(Game.describeFailedRouteSearch(program, "start.NO_SUCH_PATH")).toBe(
      "unroutable",
    );
    expect(Game.describeFailedRouteSearch(program, null)).toBe("unroutable");
  }, 120_000);

  test("an exhausted search is reported as exhausted", () => {
    const program = compileSrc(UNREACHABLE_TAIL);
    const toPath = startPathForLine(program, 5);
    Game.planRoute(newGame(program).story, program, "start", toPath);
    expect(Game.describeFailedRouteSearch(program, toPath)).toBe("exhausted");
  }, 120_000);
});

describe("a game that simulates for itself records the same reason", () => {
  test("a line no route reaches is recorded as exhausted", () => {
    const program = compileSrc(UNREACHABLE_TAIL);
    const game: any = newGame(program);
    game.setStartFrom({ file: URI, line: 5 });
    game.simulate();
    expect(game.simulationFailure).toBe("exhausted");
  }, 120_000);

  test("a file with no story flow is recorded as unroutable", () => {
    const program = compileSrc(NO_STORY_FLOW);
    const game: any = newGame(program);
    // Nothing in this file resolves to a story position, so the start path
    // falls back to the root container.
    expect(game.setStartFrom({ file: URI, line: 1 })).toBeNull();
    game.simulate();
    expect(game.simulationFailure).toBe("unroutable");
  }, 120_000);

  test("a preview that succeeds records no reason at all", () => {
    const program = compileSrc(plainScene(20));
    const game: any = newGame(program);
    game.setStartFrom({ file: URI, line: 20 });
    game.simulate();
    expect(game.simulation).toBe("success");
    expect(game.simulationFailure).toBeUndefined();
  }, 120_000);
});
