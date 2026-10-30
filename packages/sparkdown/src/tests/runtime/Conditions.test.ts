import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Conditions (ported from inkjs)", () => {
  test("all switch branches fail is clean", () => {
    const ctx = makeRuntimeStoryFromFile(
      "conditions",
      "all-switch-branches-fail-is-clean",
    );
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
    expect(ctx.story.state.evaluationStack.length).toBe(0);
  });

  test("else branches", () => {
    const ctx = makeRuntimeStoryFromFile("conditions", "else-branches");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("other\nother\nother\nother\n");
  });

  test("trivial condition", () => {
    const ctx = makeRuntimeStoryFromFile("conditions", "trivial-condition");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.Continue();
  });

  test("gather after if-block (divergent intros converging)", () => {
    const ctx = makeRuntimeStoryFromFile("conditions", "gather-inside-if");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      "Tom enters.\nNow they look at each other.\n",
    );
  });

  test("gather inside conditional body (labeled anchor)", () => {
    const ctx = makeRuntimeStoryFromFile(
      "conditions",
      "gather-inside-conditional-body",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Tom enters.\nThe crowd hushes.\n");
  });

  test("inline `{if cond then a else b}` conditional expression", () => {
    const ctx = makeRuntimeStoryFromFile("conditions", "conditionals");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "true\ntrue\ntrue\ntrue\ntrue\ngreat\nright?\n",
    );
  });

  test("empty conditional branch emits nothing", () => {
    const ctx = makeRuntimeStoryFromFile(
      "conditions",
      "empty-conditional-branch",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("");
  });
});
