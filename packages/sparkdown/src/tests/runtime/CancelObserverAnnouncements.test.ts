// A line the engine abandons through `CancelAsyncContinue` closes its batch of
// variable observations without announcing its writes: no observer hears of a
// run that did not happen, torn or whole (#281). A line that completes still
// announces them.
import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const source = [
  "store x = 0",
  "store y = 0",
  "",
  "x = 1",
  "y = 2",
  "Line one.",
  "",
].join("\n");

const observe = (story: any): [string, unknown][] => {
  const heard: [string, unknown][] = [];
  story.variablesState.ObserveVariableChange((name: string, value: unknown) => {
    heard.push([name, value]);
  });
  return heard;
};

const recorded = (story: any): number =>
  story.variablesState._changedVariablesForBatchObs?.size ?? 0;

describe("cancelling an asynchronous continue", () => {
  test("announces none of the abandoned line's writes", () => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    const story: any = ctx.story;
    const heard = observe(story);
    // Step until the line has written `x` but not finished.
    story.ContinueAsync();
    while (!story.asyncContinueComplete && recorded(story) === 0) {
      story.ContinueAsync();
    }
    expect(story.asyncContinueComplete).toBe(false);
    expect(recorded(story)).toBeGreaterThan(0);
    story.CancelAsyncContinue();
    expect(heard).toEqual([]);
    // The writes are in the state until a caller replaces it.
    expect(story.stateIsPristine).toBe(false);
  });

  test("leaves a completed line's writes announced", () => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    const story: any = ctx.story;
    const heard = observe(story);
    expect(story.Continue()).toBe("Line one.\n");
    expect(heard.map(([name]) => name).sort()).toEqual(["x", "y"]);
  });
});
