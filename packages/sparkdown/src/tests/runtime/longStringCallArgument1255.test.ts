import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

describe("long-string call arguments retain function boundaries (#1255)", () => {
  test("an uncalled function's long-string argument never plays as story", () => {
    const ctx = makeRuntimeStoryFromSource("function f()\n  print [===[\nend\n]===]\nend\nAfter.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("After.\n");
  });

  test("a call receives the multiline string's bytes", () => {
    const ctx = makeRuntimeStoryFromSource("function identity(value)\n  return value\nend\nfunction result()\n  return identity [===[\nend\n]=]\n]===]\nend\nValue {result()} done.\n");
    expect(ctx.errorMessages).toEqual([]);
    ctx.story.collapseWhitespace = false;
    expect(runToEnd(ctx.story)).toBe("Value end\n]=]\n done.\n");
  });
});
