// #384 — what stops the engine replaying a preview route.
//
// Clicking a line asks the engine to replay the story up to that line. That
// replay has to stop eventually, because an author can write a story that never
// ends. What it stops ON decides whether a long scene can be previewed at all:
// a ceiling counted in elapsed time rejects a scene for being long, reports the
// reason as "possible infinite loop", and reaches a different verdict on a busy
// machine than on an idle one.
//
// So the ceiling is counted in story advances. What must hold:
//   - a scene far longer than any real script replays end to end;
//   - a replay that genuinely runs away is still stopped;
//   - the verdict does not depend on how long the replay took.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
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

function longScene(beats: number): string {
  const lines = ["-> start", "", "scene start"];
  for (let i = 0; i < beats; i += 1) {
    lines.push(`  Beat number ${i} of the very long scene.`);
  }
  lines.push("end", "");
  return lines.join("\n");
}

/** The player worker's settings, plus a REAL clock.
 *
 *  `Game`'s default `now` is `() => 0` (a frozen clock), which silently
 *  disables every wall-clock guard in the engine. A replay measured under it
 *  reports success where the editor reports failure, so a test that means to
 *  say anything about timing has to supply a real one. */
const newGame = (program: unknown, executionStepLimit?: number) =>
  new Game({
    program: program as any,
    incrementalCheckpoints: true,
    verifyCheckpoints: false,
    now: () => performance.now(),
    ...(executionStepLimit ? { executionStepLimit } : {}),
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

const previewLastBeat = (program: unknown, beats: number, limit?: number) => {
  const game = newGame(program, limit);
  const anyGame = game as any;
  const errors: string[] = [];
  const realError = anyGame.Error.bind(anyGame);
  anyGame.Error = (message: string, ...rest: unknown[]) => {
    errors.push(String(message));
    return realError(message, ...rest);
  };

  game.setStartFrom({ file: URI, line: beats + 1 });
  const toPath = anyGame.startPath as string;
  const route = Game.planRoute(
    game.story,
    program as any,
    Game.getSimulateFromPath(toPath),
    toPath,
  );
  if (route) {
    game.patchAndSimulateRoute(route);
  }
  return {
    route,
    errors,
    simulation: anyGame._simulation as string | undefined,
    advancesUsed:
      (anyGame._executionStepLimit as number) -
      (anyGame._executionStepsRemaining as number),
  };
};

describe("a long scene replays to its end", () => {
  // 20,000 display lines replays in about 13 seconds on this machine. Under a
  // ten-second ceiling that is abandoned partway and reported to the author as
  // a possible infinite loop, on a scene that contains no loop at all.
  test("a 20,000 line scene previews its last beat instead of reporting a loop", () => {
    const beats = 20_000;
    const program = compileSrc(longScene(beats));
    const result = previewLastBeat(program, beats);

    expect(result.route).toBeTruthy();
    expect(result.simulation).toBe("success");
    expect(result.errors).toEqual([]);
    // However long it took, the replay was ordinary work: comfortably inside
    // the ceiling, which is what makes the verdict machine-independent.
    expect(result.advancesUsed).toBeGreaterThan(100_000);
    expect(result.advancesUsed).toBeLessThan(500_000);
  }, 300_000);
});

describe("a replay that runs away is still stopped", () => {
  test("a ceiling below what the scene needs stops it and says so", () => {
    const beats = 400;
    const program = compileSrc(longScene(beats));
    const generous = previewLastBeat(program, beats);
    expect(generous.simulation).toBe("success");
    expect(generous.errors).toEqual([]);

    // The same scene, with a ceiling deliberately below its cost.
    const starved = previewLastBeat(program, beats, 50);
    expect(starved.simulation).not.toBe("success");
    expect(starved.errors.join("\n")).toContain("possible infinite loop");
    expect(starved.errors.join("\n")).toContain("50 steps");
  }, 300_000);

  test("the verdict is decided by the declared ceiling, every time", () => {
    const beats = 400;
    const program = compileSrc(longScene(beats));
    const needed = previewLastBeat(program, beats).advancesUsed;
    expect(needed).toBeGreaterThan(100);

    // Repeating either side of the boundary always reaches the same verdict.
    // Under a clock these are a coin toss on a loaded machine.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(previewLastBeat(program, beats, needed).simulation).toBe("success");
      expect(previewLastBeat(program, beats, needed - 1).simulation).not.toBe(
        "success",
      );
    }
  }, 300_000);
});
