import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const source = ["scene start", "  Line one.", "  Line two.", "end", ""].join(
  "\n",
);

describe("ResetState with an asynchronous continue's line open", () => {
  test("ends the open line and leaves a pristine state", () => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    const story: any = ctx.story;
    story.ContinueAsync();
    expect(story.asyncContinueComplete).toBe(false);
    expect(() => story.ResetState()).not.toThrow();
    expect(story.asyncContinueComplete).toBe(true);
    expect(story.stateIsPristine).toBe(true);
    expect(story.Continue()).toBe("Line one.\n");
  });

  test("restore ends the open line and leaves the restored state readable", () => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    const story: any = ctx.story;
    expect(story.Continue()).toBe("Line one.\n");
    const image = story.capture();
    story.ContinueAsync();
    expect(story.asyncContinueComplete).toBe(false);
    expect(story.restore(image)).toBe(true);
    expect(story.asyncContinueComplete).toBe(true);
    expect(story.currentText).toBe("Line one.\n");
    expect(story.Continue()).toBe("Line two.\n");
  });

  test("still refuses from inside a running continue", () => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    const story: any = ctx.story;
    const original = story.ContinueSingleStep;
    let thrown: unknown;
    story.ContinueSingleStep = function () {
      story.ContinueSingleStep = original;
      try {
        story.ResetState();
      } catch (e) {
        thrown = e;
      }
      return original.call(this);
    };
    story.Continue();
    expect(thrown).toBeInstanceOf(Error);
  });
});
