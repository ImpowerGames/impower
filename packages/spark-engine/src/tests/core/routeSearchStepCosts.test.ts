// #667 - two per-step costs the route search pays for nothing.
//
// The search walks the story looking for a way to reach the line the author
// clicked, and it advances the story once per step. Two things happened on
// every one of those advances that no part of the search ever reads:
//
//   - The engine calls the story owner's execution hook with the text of the
//     pointer's path. The search does not want that hook to fire, and the
//     engine skips building the path string only when the hook is null, so the
//     search suppresses it with null rather than a do-nothing function.
//
//   - The engine built and started a stopwatch on every advance, to stop an
//     asynchronous continue that had run out of a millisecond budget. No
//     caller asks for such a budget: every one passes an unbounded limit,
//     which stops after a single step whatever the clock says, or a
//     non-positive one, which runs to the end of the line. So the engine no
//     longer measures elapsed time at all, and refuses a finite budget rather
//     than silently treating it as one step.
//
// What must hold: a search reads no clock per step, the story owner's own
// execution hook is put back exactly as it was, and a limit the engine cannot
// honour is refused.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { planRoute } from "@impower/sparkdown/src/compiler/utils/planRoute";
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

  // The engine reads a clock through `new Date().getTime()`; `planRoute`'s own
  // search deadline uses `performance.now()` or `Date.now()`, neither of which
  // goes through an instance. So counting instance clock reads over a search
  // isolates the engine's own.
  //
  // One such read remains, and it is not per step: building a story state
  // seeds its randomness from the clock, which happens once per state the
  // search constructs. What must not happen is a read on every story advance,
  // so the property here is that a search reads the clock fewer times than it
  // takes steps.
  const clockReadsForScene = (beats: number) => {
    const program = compileSrc(longScene(beats));
    const toPath = targetPathForLine(program, beats + 2);
    expect(toPath).not.toBe("0");
    const game = newGame(program);

    const originalGetTime = Date.prototype.getTime;
    let reads = 0;
    Date.prototype.getTime = function (this: Date) {
      reads += 1;
      return originalGetTime.call(this);
    };
    try {
      const route = planRoute(game.story, "start", toPath, {
        stayWithinKnot: true,
      });
      expect(route).toBeTruthy();
      expect(route!.steps.length).toBeGreaterThan(beats);
      return { reads, steps: route!.steps.length };
    } finally {
      Date.prototype.getTime = originalGetTime;
    }
  };

  test("advancing the story during a search reads no clock", () => {
    const short = clockReadsForScene(BEATS);
    const long = clockReadsForScene(BEATS * 4);

    // The longer scene really does take far more advances to reach.
    expect(long.steps).toBeGreaterThan(short.steps * 3);

    expect(short.reads).toBeLessThan(short.steps);
    expect(long.reads).toBeLessThan(long.steps);

    // And what is left does not track the number of advances at all.
    expect(short.reads).toBe(BEATS);
    expect(long.reads).toBe(BEATS * 4);
  }, 240_000);

  test("a continue refuses a limit it cannot honour", () => {
    const program = compileSrc(SCENE);
    const story = newGame(program).story as any;

    // Nothing measures elapsed time, so a millisecond budget would silently
    // become one step per call.
    expect(() => story.ContinueAsync(500)).toThrow(/elapsed time is not measured/);
    expect(() => story.ContinueInternal(0.5)).toThrow(/elapsed time is not measured/);

    // The two limits the engine does honour are still accepted.
    expect(() => story.ContinueAsync(Infinity)).not.toThrow();
    expect(story.asyncContinueComplete).toBe(false);
    story.CancelAsyncContinue();
    expect(() => story.Continue()).not.toThrow();
  }, 120_000);
});
