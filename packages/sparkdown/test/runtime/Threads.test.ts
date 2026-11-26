import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile } from "./runtimeTestHarness";

describe("Threads (ported from inkjs)", () => {
  test("multi threads merge choices at a single decision point", () => {
    const ctx = makeRuntimeStoryFromFile("threads", "multi-threads");
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("You arrive at the town square.\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"What do you sell?"',
      '"Any news?"',
      '"Leave town"',
    ]);
  });

  test("thread reaching DONE terminates without taking down the main flow", () => {
    const ctx = makeRuntimeStoryFromFile("threads", "thread-done");
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe(
      "Before threading.\nIn the thread.\nAfter threading.\n",
    );
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Continue"',
    ]);
  });

  test("thread spawned inside a conditional block", () => {
    const ctx = makeRuntimeStoryFromFile("threads", "thread-in-logic");
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("At the gates.\n");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Talk to companion"',
      '"Enter alone"',
    ]);
  });

  test("thread choices survive the main flow reaching DONE", () => {
    const ctx = makeRuntimeStoryFromFile(
      "threads",
      "thread-survives-main-done",
    );
    expect(ctx.errorMessages).toEqual([]);

    let output = "";
    while (ctx.story.canContinue) output += ctx.story.Continue();
    expect(output).toBe("");
    expect(ctx.story.currentChoices.map((c) => c.text)).toEqual([
      '"Survivor choice"',
    ]);
  });
});
