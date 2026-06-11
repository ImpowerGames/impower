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
    // Lua `/` is ALWAYS true float division, regardless of operand
    // int-ness — all four rows produce 2.333... (The inkjs original
    // expected `7 / 3` → 2 via ink's truncating integer division;
    // Luau conformance replaced that with float `/`. Floor division
    // is the separate `//` operator, covered by Evaluation.test.ts.)
    const ctx = makeRuntimeStoryFromFile("extra", "arithmetic-2");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(
      "2.3333333333333335\n2.3333333333333335\n2.3333333333333335\n2.3333333333333335\n",
    );
  });
});
