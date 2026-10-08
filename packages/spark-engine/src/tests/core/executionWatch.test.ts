// #679 — the player's worker has to tell a script that never yields from a
// long compile. The story calls the execution watch as it steps, so a
// story that runs on without yielding is heard however it loops: in a Luau
// loop inside one function call, which the story sees as a single step of the
// line that called it, or in a scene that diverts to itself. Each call names
// the story, whose position says which line was running. The program engine
// (`ProgramStory`), which runs a program compiled to statement chunks, calls
// the watch on the same steps.

import "@impower/sparkdown/src/inkjs/engine/Container";
import { afterEach, describe, expect, test } from "vitest";
import {
  EXECUTION_WATCH_STEPS,
  executionWatch,
  type WatchedStory,
} from "@impower/sparkdown/src/inkjs/engine/ExecutionWatch";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { Game } from "../../game/core/classes/Game";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

/** A step budget a loop that never ends reaches in a moment, many times the
 *  watch's interval: the run is synchronous, and no test timeout can end it.
 *  Kept small because a loop inside an interpolation slows as it runs: every
 *  step scans the output the loop has left so far. */
const STEP_LIMIT = EXECUTION_WATCH_STEPS * 16;

/** The calls a run to the budget makes at the least: the continue spends
 *  some of its budget before the loop begins. */
const LEAST_CALLS = STEP_LIMIT / EXECUTION_WATCH_STEPS - 2;

const LUAU_LOOP = [
  "function spin()",
  "  local n = 0",
  "  while true do",
  "    n = n + 1",
  "  end",
  "  return n",
  "end",
  "",
  "BOB:",
  "  Before the loop.",
  "",
  "BOB:",
  "  Spinning {spin()}.",
  "",
].join("\n");

const DIVERT_LOOP = [
  "BOB:",
  "  Before the loop.",
  "",
  "-> around",
  "",
  "scene around",
  "  -> around",
  "",
].join("\n");

const runtimeErrors = (messages: any[]) =>
  messages
    .filter((m) => m.method === "game/runtimeError")
    .map((m) => String(m.params.message));

/** PLAY `source` from `line` (zero-based) with a lowered step budget, and
 *  every story the watch heard from, with the line each was running. The
 *  game runs the program engine, as every host's does, unless
 *  `programChunks` is false. */
const playWatched = async (
  source: string,
  line: number,
  programChunks = true,
) => {
  const heard: { story: WatchedStory; line: number | null }[] = [];
  const h = createHarness(source, line, { programChunks });
  await h.ready;
  h.reset();
  const game = h.game as any;
  game._executionStepLimit = STEP_LIMIT;
  executionWatch.listener = (story) => {
    const location = Game.storyLocation(story as any, game.program);
    heard.push({ story, line: location?.range.start.line ?? null });
  };
  game.setStartFrom({ file: MAIN_URI, line }, "first");
  game.start();
  // What the start ran, the builtins' declarations among it, is not the loop.
  // The watch is called on multiples of the interval of the story's step
  // count, which the start leaves wherever it ends; from one, the next call
  // is a whole interval away.
  heard.length = 0;
  game.story.stepCount = 1;
  // Advance past the first beat, into the loop.
  game.continue();
  return {
    game,
    heard,
    errors: runtimeErrors(h.messages),
    steps: game.story.stepCount - 1,
  };
};

afterEach(() => {
  executionWatch.listener = null;
});

describe("the execution watch (#679)", () => {
  test("hears a Luau loop inside one function call, on the loop's lines", async () => {
    const { game, heard, errors } = await playWatched(LUAU_LOOP, 9);
    expect(game.story).toBeInstanceOf(ProgramStory);
    // The engine's own ceiling stopped it, which is what ends the test.
    expect(errors.join("\n")).toContain("possible infinite loop");
    // Called on the interval, from the story the game runs, throughout.
    expect(heard.length).toBeGreaterThanOrEqual(LEAST_CALLS);
    expect(heard.every((h) => h.story === game.story)).toBe(true);
    // Once the loop begins, the position is inside `spin`, whose loop is
    // lines 2 to 4 (zero-based); the first calls can come on the way in.
    const inLoop = heard.filter((h) => h.line != null && h.line >= 1 && h.line <= 5);
    expect(inLoop.length).toBeGreaterThanOrEqual(LEAST_CALLS - 2);
    expect(inLoop.at(-1)).toBe(heard.at(-1));
  }, 120_000);

  test("hears a scene that diverts to itself, on the divert's line", async () => {
    const { game, heard, errors } = await playWatched(DIVERT_LOOP, 0);
    expect(errors.join("\n")).toContain("possible infinite loop");
    expect(heard.length).toBeGreaterThanOrEqual(LEAST_CALLS);
    expect(heard.every((h) => h.story === game.story)).toBe(true);
    const lines = new Set(heard.map((h) => h.line));
    expect([...lines].every((l) => l === 5 || l === 6)).toBe(true);
  }, 120_000);

  test("is not called by a beat that ends", async () => {
    const { game, heard, errors, steps } = await playWatched(
      "BOB:\n  One.\n\nBOB:\n  Two.\n",
      0,
    );
    expect(game.story).toBeInstanceOf(ProgramStory);
    expect(errors).toEqual([]);
    // A beat is far shorter than the interval, so it is never heard.
    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThan(EXECUTION_WATCH_STEPS);
    expect(heard).toEqual([]);
  }, 120_000);
});
