import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Newlines (ported from inkjs)", () => {
  test("newline consistency: same-line divert", () => {
    const ctx = makeRuntimeStoryFromFile(
      "newlines",
      "newline-consistency-1",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("hello world\n");
  });

  test("newline consistency: same-line choice + divert (* hello -> there)", () => {
    const ctx = makeRuntimeStoryFromFile("newlines", "newline-consistency-2");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("hello world\n");
  });

  test("newline consistency: choice + next-line divert", () => {
    const ctx = makeRuntimeStoryFromFile("newlines", "newline-consistency-3");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    ctx.story.ChooseChoiceIndex(0);
    expect(runToEnd(ctx.story)).toBe("hello\nworld\n");
  });

  test("newline at start of multiline conditional (scene rewrite of `newline_at_start_of_multiline_conditional.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "newlines",
      "newline-at-start-of-multiline-conditional",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("X\nx\n");
  });

  test("newlines around value-returning function (rewrite of `newlines_with_string_eval`)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "newlines",
      "value-returning-function-eval",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nB\nA\n3\nB\n");
  });
});
