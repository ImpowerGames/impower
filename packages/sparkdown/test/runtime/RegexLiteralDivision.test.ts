import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function evaluate(expr: string): { out: string; errors: string[] } {
  const src =
    `store a = 10\nstore b = 2\nstore c = 5\n` +
    `scene start\n  {${expr}}\nend\n`;
  const ctx = makeRuntimeStoryFromSource(src);
  let out = "";
  while (ctx.story.canContinue) out += ctx.story.Continue() ?? "";
  return { out: out.trim(), errors: ctx.errorMessages };
}

describe("regex literal vs division", () => {
  test.each([
    ["a / 2", "5"],
    ["a/2", "5"],
    ["a / b / c", "1"],
    ["a/b/c", "1"],
    ["100/8", "12.5"],
    ["a / (b + c)", "1.4285714285714286"],
    ["(a + b) / c", "2.4"],
  ])("`%s` evaluates to %s", (expr, want) => {
    const r = evaluate(expr);
    expect(r.errors).toEqual([]);
    expect(r.out).toBe(want);
  });
});
