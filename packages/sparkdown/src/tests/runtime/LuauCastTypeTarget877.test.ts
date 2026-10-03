import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

describe("Luau casts to type targets (#877)", () => {
  test("preserves the value cast to an optional type", () => {
    const ctx = makeRuntimeStoryFromSource(
      "Value {f()}.\nfunction f()\n  local a = 55 :: number?\n  return a\nend\n",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 55.\n");
  });
});
