// `/pattern/flags` regex literals share their opening character with the
// DIVISION operator, so the grammar rule sits just before
// `LuauArithmeticOperation` and refuses to open on whitespace, `=` or `/`
// (`a / b`, `/=`, `// comment`).
//
// Absence of a diagnostic is NOT sufficient evidence here: a misparsed `/b/`
// would produce a silently WRONG value rather than an error. So these evaluate
// the expressions and check the results.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function evaluate(expr: string): { out: string; errors: string[] } {
  const src =
    `store a = 10\nstore b = 2\nstore c = 5\n` +
    `-> start\nscene start\n  {${expr}}\nend\n`;
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
