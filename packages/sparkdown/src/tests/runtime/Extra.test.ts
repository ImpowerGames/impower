// Ported from inkjs `src/tests/specs/ink/Extra.spec.ts`.
//
// Just one test in this spec: int-vs-float arithmetic. Already
// covered partially by `Evaluation.test.ts`; this extends it with
// the specific `int/int`, `int/float`, `float/int`, `float/float`
// matrix to make sure the int-vs-float type system holds through
// division. Sparkdown's `WriteFloat` marker convention (`"3.0f"`
// preserved across JSON round-trip) is what makes this work.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Extra (ported from inkjs)", () => {
  test("arithmetic: int-vs-float division matrix", () => {
    // - `7 / 3` (int/int) → `2` (integer division, truncated)
    // - `7 / 3.0` (int/float) → `2.333...` (float, coerced)
    // - `7.0 / 3` (float/int) → `2.333...`
    // - `7.0 / 3.0` (float/float) → `2.333...`
    // The inkjs original also exercised `FLOAT(...)` casts; sparkdown
    // doesn't have ink's all-caps `FLOAT` builtin (math casts are
    // luau-style — `tonumber(...)`), so those rows are dropped.
    const ctx = makeRuntimeStoryFromFile("extra", "arithmetic-2");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      "2\n2.3333333333333335\n2.3333333333333335\n2.3333333333333335\n",
    );
  });
});
