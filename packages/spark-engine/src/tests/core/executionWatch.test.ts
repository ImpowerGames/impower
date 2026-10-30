import { afterEach, describe, expect, test } from "vitest";
import {
  EXECUTION_WATCH_STEPS,
  executionWatch,
  type WatchedStory,
} from "@impower/sparkdown/src/runtime/ExecutionWatch";
import { ProgramStory } from "@impower/sparkdown/src/program/ProgramStory";
import { Game } from "../../game/core/classes/Game";
import { createHarness, MAIN_URI } from "../ui/harness/uiTestHarness";

const STEP_LIMIT = EXECUTION_WATCH_STEPS * 16;

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
  "scene start",
  "  BOB:",
  "    Before the loop.",
  "",
  "  BOB:",
  "    Spinning {spin()}.",
  "end",
  "",
].join("\n");

const DIVERT_LOOP = [
  "scene start",
  "  BOB:",
  "    Before the loop.",
  "",
  "  -> around",
  "end",
  "",
  "scene around",
  "  -> around",
  "",
].join("\n");

const runtimeErrors = (messages: any[]) =>
  messages
    .filter((m) => m.method === "game/runtimeError")
    .map((m) => String(m.params.message));

const playWatched = async (source: string, line: number) => {
  const heard: { story: WatchedStory; line: number | null }[] = [];
  const h = createHarness(source, line);
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
  heard.length = 0;
  game.story.stepCount = 1;
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
    const { game, heard, errors } = await playWatched(LUAU_LOOP, 10);
    expect(game.story).toBeInstanceOf(ProgramStory);
    expect(errors.join("\n")).toContain("possible infinite loop");
    expect(heard.length).toBeGreaterThanOrEqual(LEAST_CALLS);
    expect(heard.every((h) => h.story === game.story)).toBe(true);
    const inLoop = heard.filter((h) => h.line != null && h.line >= 1 && h.line <= 5);
    expect(inLoop.length).toBeGreaterThanOrEqual(LEAST_CALLS - 2);
    expect(inLoop.at(-1)).toBe(heard.at(-1));
  }, 120_000);

  test("hears a scene that diverts to itself, on the divert's line", async () => {
    const { game, heard, errors } = await playWatched(DIVERT_LOOP, 1);
    expect(errors.join("\n")).toContain("possible infinite loop");
    expect(heard.length).toBeGreaterThanOrEqual(LEAST_CALLS);
    expect(heard.every((h) => h.story === game.story)).toBe(true);
    const lines = new Set(heard.map((h) => h.line));
    expect([...lines].every((l) => l === 7 || l === 8)).toBe(true);
  }, 120_000);

  test("is not called by a beat that ends", async () => {
    const { game, heard, errors, steps } = await playWatched(
      "scene start\n  BOB:\n    One.\n\n  BOB:\n    Two.\nend\n",
      1,
    );
    expect(game.story).toBeInstanceOf(ProgramStory);
    expect(errors).toEqual([]);
    expect(steps).toBeGreaterThan(0);
    expect(steps).toBeLessThan(EXECUTION_WATCH_STEPS);
    expect(heard).toEqual([]);
  }, 120_000);
});
