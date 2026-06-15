// Ported from inkjs `src/tests/specs/ink/Booleans.spec.ts`.
//
// Each fixture is a one-liner that interpolates a boolean expression at top
// level (`{true}`, `{not 1}`, etc.) and the inkjs reference output is the
// stringified result with a trailing newline.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile, runToEnd } from "./runtimeTestHarness";

describe("Booleans (ported from inkjs)", () => {
  function expectOutput(fixture: string, expected: string) {
    const ctx = makeRuntimeStoryFromFile("booleans", fixture);
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe(expected);
  }

  test("true", () => expectOutput("true", "true\n"));
  test("true + 1", () => expectOutput("true-plus-one", "2\n"));
  test("2 + true", () => expectOutput("two-plus-true", "3\n"));
  test("false + false", () => expectOutput("false-plus-false", "0\n"));
  test("true + true", () => expectOutput("true-plus-true", "2\n"));
  test("true == 1", () => expectOutput("true-equals-one", "true\n"));
  test("not 1", () => expectOutput("not-one", "false\n"));
  test("not true", () => expectOutput("not-true", "false\n"));
  test("3 > 1", () => expectOutput("three-greater-than-one", "true\n"));

  test("list hasnt — `not t:find(x)` truthy-check (rewrite of inkjs `list_hasnt.ink`)", () => {
    // Upstream ink fixture:
    //   LIST list = a, (b), c, (d), e
    //   {list !? (c)}
    // The `(b)` / `(d)` parens make those items active in the initial
    // list state. `list !? (c)` (or its ink keyword form `list hasnt
    // (c)`) tests "(c) is NOT a member of list" — since list contains
    // only b and d, the result is true.
    //
    // Sparkdown rewrite: the LIST type becomes a Luau array-style
    // table `{"b", "d"}` (just the active items — no separate
    // universe concept). `list` is not reserved in sparkdown (it
    // never gates a syntactic construct), so we can keep the original
    // variable name. Membership goes through the receiver method
    // `t:find(value)`, which returns the index of `value` in the
    // table or nil (lowered to 0, sparkdown-style falsy) on miss.
    // `not list:find("c")` returns true iff "c" isn't in the table.
    expectOutput("list-hasnt", "true\n");
  });
});
