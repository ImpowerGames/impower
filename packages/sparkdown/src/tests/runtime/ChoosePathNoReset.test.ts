// A path chosen without resetting the call stack, between two continues of a
// flow that still has lines left, starts the chosen flow at its first line,
// in session and after the state is saved and loaded into a fresh story. The
// first continue stops with a line of the flow still to run, so the choice is
// made while the engine is inside the flow rather than after it ran out.
// Choosing `main` from inside `main` enters no new flow, so its count stays 1.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import type { TestStory } from "../engineUnderTest";

const SCRIPT = ["scene main", "  Visits {main}.", "  Waiting.", "  done", "end", ""].join("\n");

// Every line the story shows until it can continue no further.
function drain(story: TestStory): string[] {
  const lines: string[] = [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    if (text.trim()) lines.push(text);
  }
  return lines;
}

describe("ChoosePathString without a reset between continues", () => {
  test("restarts the chosen flow at its first line", () => {
    const ctx = makeRuntimeStoryFromSource(SCRIPT, "inmemory://repro/main.sd");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.ChoosePathString("main");
    expect(ctx.story.Continue()).toBe("Visits 1.\n");
    expect(ctx.story.canContinue).toBe(true);
    ctx.story.ChoosePathString("main", false);
    expect(drain(ctx.story)).toEqual(["Visits 1.\n", "Waiting.\n"]);
  });

  test("restarts the chosen flow at its first line after a save and load", () => {
    const ctx = makeRuntimeStoryFromSource(SCRIPT, "inmemory://repro/main.sd");
    ctx.story.ChoosePathString("main");
    expect(ctx.story.Continue()).toBe("Visits 1.\n");
    expect(ctx.story.canContinue).toBe(true);
    const saved = ctx.story.state.toJson();
    const loaded = makeRuntimeStoryFromSource(SCRIPT, "inmemory://repro/main.sd");
    loaded.story.state.LoadJson(saved);
    loaded.story.ChoosePathString("main", false);
    expect(drain(loaded.story)).toEqual(["Visits 1.\n", "Waiting.\n"]);
  });
});
