import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const source = ["scene start", "  Line one.", "  Line two.", "end", ""].join(
  "\n",
);

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
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    const story: any = ctx.story;
    withFirstStepThrowing(story);
    expect(() => story.ContinueAsync()).toThrow(TypeError);
    expect(story.asyncContinueComplete).toBe(false);
    expect(() => story.CancelAsyncContinue()).not.toThrow();
    expect(() => story.ResetState()).not.toThrow();
    expect(story.Continue()).toBe("Line one.\n");
  });

  test("leaves a synchronous continue's story able to reset", () => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    const story: any = ctx.story;
    withFirstStepThrowing(story);
    expect(() => story.Continue()).toThrow(TypeError);
    expect(() => story.CancelAsyncContinue()).not.toThrow();
    expect(() => story.ResetState()).not.toThrow();
    expect(story.Continue()).toBe("Line one.\n");
  });
});
