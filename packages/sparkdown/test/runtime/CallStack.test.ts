import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("CallStack (ported from inkjs)", () => {
  test("callstack evaluation (nested function calls)", () => {
    const ctx = makeRuntimeStoryFromFile("callstack", "callstack-evaluation");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("8\n");
  });

  test("clean callstack reset on path choice (scene rewrite of `clean_callstack_reset_on_path_choice.ink`)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "callstack",
      "clean-callstack-reset-on-path-choice",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("The first line.\n");
    ctx.story.ChoosePathString("SomewhereElse", true, []);
    expect(ctx.story.ContinueMaximally()).toBe("somewhere else\n");
  });
});
