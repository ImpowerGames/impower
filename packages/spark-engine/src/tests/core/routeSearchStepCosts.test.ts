// #667 — two per-step costs the route search pays for nothing.
//
// The search walks the story looking for a way to reach the line the author
// clicked, and it advances the story once per step. Two things happen on every
// one of those advances that no part of the search ever reads:
//
//   - The engine calls the story owner's execution hook with the text of the
//     pointer's path. The search does not want that hook to fire, so it
//     installs a do-nothing function over it; but the engine only skips
//     building the path string when the hook is null, so a string is built and
//     thrown away on every step. Suppressing the hook with null instead of a
//     do-nothing function removes the work outright.
//
//   - The engine builds and starts a stopwatch on every advance so it can stop
//     an asynchronous continue that has run out of its time budget. The search
//     asks for an unbounded budget, which makes the engine stop after a single
//     step regardless of the clock, so the elapsed time never decides
//     anything.
//
// What must hold: neither cost is paid during a search, and the story owner's
// own execution hook is put back exactly as it was when the search ends.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { planRoute } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { Stopwatch } from "@impower/sparkdown/src/inkjs/engine/StopWatch";
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

/** A single scene of `beats` display lines, so a route to its end takes many
 *  story advances. Its last beat is on line `beats + 2`, counting from zero. */
function longScene(beats: number): string {
  const lines = ["-> start", "", "scene start"];
  for (let i = 0; i < beats; i += 1) {
    lines.push(`  Beat number ${i} of the long scene.`);
  }
  lines.push("end", "");
  return lines.join("\n");
}

/** Resolve a source line to the runtime path the preview would target. */
function targetPathForLine(program: unknown, line: number): string {
  const game = newGame(program);
  game.setStartFrom({ file: URI, line });
  return (game as any).startPath as string;
}

const BEATS = 50;
const SCENE = longScene(BEATS);

describe("a route search pays neither per-step cost", () => {
  test("the execution hook is suppressed with null, and restored afterwards", () => {
    const program = compileSrc(SCENE);
    const toPath = targetPathForLine(program, BEATS + 2);
    expect(toPath).not.toBe("0");

    const game = newGame(program);
    const story = game.story as any;

    // The hook the story owner had installed before the search began.
    const ownersHook = (arg1: string | undefined) => void arg1;
    story.onExecute = ownersHook;

    // Watch every value the search writes to the hook. The engine only skips
    // building the pointer's path string when the hook is null, so a search
    // that installs a function pays for a string on every advance.
    const assigned: unknown[] = [];
    let current: unknown = story.onExecute;
    Object.defineProperty(story, "onExecute", {
      configurable: true,
      get: () => current,
      set: (value: unknown) => {
        assigned.push(value);
        current = value;
      },
    });

    const route = planRoute(story, "start", toPath, { stayWithinKnot: true });
    expect(route).toBeTruthy();

    const duringSearch = assigned.slice(0, -1);
    expect(duringSearch.length).toBeGreaterThan(0);
    expect(duringSearch.every((value) => value === null)).toBe(true);

    // And the owner gets their own hook back, unchanged.
    expect(story.onExecute).toBe(ownersHook);
  }, 120_000);

  // A search still starts one stopwatch, in the single story reset it ends
  // with: resetting re-runs the story's global declarations through an
  // ordinary timed continue. That is one per search however long the route is,
  // and it is not what this ticket is about. What must not happen is a
  // stopwatch per story advance, so the measurement here is whether the count
  // grows with the length of the route.
  const stopwatchStartsForScene = (beats: number) => {
    const program = compileSrc(longScene(beats));
    const toPath = targetPathForLine(program, beats + 2);
    expect(toPath).not.toBe("0");
    const game = newGame(program);

    const originalStart = Stopwatch.prototype.Start;
    let starts = 0;
    Stopwatch.prototype.Start = function (this: Stopwatch) {
      starts += 1;
      return originalStart.call(this);
    };
    try {
      const route = planRoute(game.story, "start", toPath, {
        stayWithinKnot: true,
      });
      expect(route).toBeTruthy();
      expect(route!.steps.length).toBeGreaterThan(beats);
      return { starts, steps: route!.steps.length };
    } finally {
      Stopwatch.prototype.Start = originalStart;
    }
  };

  test("the stopwatch count does not grow with the length of the route", () => {
    const short = stopwatchStartsForScene(BEATS);
    const long = stopwatchStartsForScene(BEATS * 4);

    // The longer scene really does take far more advances to reach.
    expect(long.steps).toBeGreaterThan(short.steps * 3);

    expect(long.starts).toBe(short.starts);
    expect(short.starts).toBeLessThanOrEqual(1);
  }, 240_000);
});
