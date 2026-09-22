// An engine error thrown out of a story step leaves the continue it came from.
// The story must stop counting that continue as running, or it can never be
// cancelled, reset, jumped or loaded again (#473).
import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const withFirstStepThrowing = (story: any) => {
  const original = story.ContinueSingleStep;
  let steps = 0;
  story.ContinueSingleStep = function () {
    steps += 1;
    if (steps === 1) {
      throw new TypeError("a step threw");
    }
    return original.call(this);
  };
};

describe("an error thrown out of a story step", () => {
  test("leaves an asynchronous continue's open line cancellable", () => {
    const ctx = makeRuntimeStoryFromSource(["Line one.", "Line two.", ""].join("\n"));
    expect(ctx.errorMessages).toEqual([]);
    const story: any = ctx.story;
    withFirstStepThrowing(story);
    expect(() => story.ContinueAsync()).toThrow(TypeError);
    // The line the step belonged to is still open, for the caller to end.
    expect(story.asyncContinueComplete).toBe(false);
    expect(() => story.CancelAsyncContinue()).not.toThrow();
    expect(() => story.ResetState()).not.toThrow();
    expect(story.Continue()).toBe("Line one.\n");
  });

  test("leaves a synchronous continue's story able to reset", () => {
    const ctx = makeRuntimeStoryFromSource(["Line one.", "Line two.", ""].join("\n"));
    expect(ctx.errorMessages).toEqual([]);
    const story: any = ctx.story;
    withFirstStepThrowing(story);
    expect(() => story.Continue()).toThrow(TypeError);
    expect(() => story.CancelAsyncContinue()).not.toThrow();
    expect(() => story.ResetState()).not.toThrow();
    expect(story.Continue()).toBe("Line one.\n");
  });
});
