import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Two fixes for Lua-fidelity multi-return spread at variadic call
// sites (basic.luau lines 36-38 — pcall + concat tests).
//
// 1. **PackTuple(0) spreads the last regular arg's MultiValue.** For
//    a call like `f(pcall(...))` against `function f(head, ...)`,
//    the lowerer emits one regular-arg push followed by
//    `PackTuple(0)` (zero surplus). Before this fix the runtime
//    treated PackTuple(0) as "build an empty MultiValue and push",
//    leaving the pcall's MultiValue([true, nil]) intact in the
//    `head` slot — which then truncated to its first value `true`,
//    losing the `nil`. Now PackTuple(0) ALSO peeks the prior stack
//    value: if it's a MultiValue, the first inner value replaces it
//    as the regular arg, and the remaining inner values populate
//    the new MultiValue. So `f(pcall(...))` correctly binds
//    `head = true` and `... = (nil)`.
//
// 2. **pcall strips leading Void from collected results.** Empty
//    functions push a `Void` sentinel at PopFunction. pcall's
//    eval-stack drain collected `[Void]` and wrapped it as
//    `MultiValue([true, void])`, then with fix (1) above that
//    void value spread into the receiver's vararg slot — so
//    `concat(pcall(function() end))` was producing `"true,nil"`
//    instead of just `"true"`. Strip leading Voids in the pcall
//    drain so empty returns are accurately reported as "no values".

const CONCAT_HELPER = `function concat(head, ...) if select('#', ...) == 0 then return tostring(head) else return tostring(head) .. "," .. concat(...) end end`;

describe("multi-return spread at variadic call sites", () => {
  test("PackTuple(0) spreads a MultiValue into the regular arg + vararg", () => {
    // Direct probe of fix (1): a variadic fn receives pcall's
    // 2-value return; head gets the first, varargs gets the rest.
    const r = runConformanceSource(
      `local function f(head, ...) return select('#', ...) end\n` +
      `local n = f(pcall(function() return nil end))\n` +
      `assert(n == 1, "vararg count = " .. tostring(n))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("concat(pcall(...)) with nil return — basic.luau line 37", () => {
    const r = runConformanceSource(
      `${CONCAT_HELPER}\n` +
      `assert(concat(pcall(function() return nil end)) == "true,nil")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("concat(pcall(empty fn)) — basic.luau line 36", () => {
    // Direct probe of fix (2): pcall over an empty function should
    // return just `true`, not `(true, void)`.
    const r = runConformanceSource(
      `${CONCAT_HELPER}\n` +
      `assert(concat(pcall(function() end)) == "true")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("concat(pcall(fn returning 1, 2, 3)) — basic.luau line 38", () => {
    const r = runConformanceSource(
      `${CONCAT_HELPER}\n` +
      `assert(concat(pcall(function() return 1, 2, 3 end)) == "true,1,2,3")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: variadic call with single non-MV last arg", () => {
    const r = runConformanceSource(
      `local function f(head, ...) return select('#', ...) end\n` +
      `assert(f(42) == 0)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: variadic call with multi extras", () => {
    const r = runConformanceSource(
      `local function f(head, ...) return select('#', ...) end\n` +
      `assert(f(1, 2, 3, 4) == 3)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
