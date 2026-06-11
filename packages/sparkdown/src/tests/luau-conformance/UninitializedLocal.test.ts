import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Uninitialized `local a` followed by a same-line statement.
//
// When no `=` follows the declared name (because a statement like
// `if` comes next on the same line), the grammar emits the name as a
// plain `LuauAccessPath` instead of a `LuauVariableAssignment`
// wrapper. `lowerVariableDefinition` only recognized the VA shape, so
// the bare path fell into the trailing-RHS bucket, `targets` stayed
// empty, and the whole declaration was SILENTLY DROPPED — `a` then
// resolved to any same-named global instead of a fresh nil local.
//
// The bug was invisible when no global `a` existed (the fallback read
// nil too) — it only surfaced when earlier code created the global,
// which is exactly what basic.luau's line 43 does before line 84.
//
// Fix: treat a single-segment plain-variable access path seen BEFORE
// any `=` as a bare declaration target (single and multi forms).

describe("uninitialized local + same-line statement", () => {
  test("shadows an existing global (basic.luau line 84 in context)", () => {
    const r = runConformanceSource(
      `a = 99
assert((function() local a if a then a = 2 end return a end)() == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("write lands on the local, not the global", () => {
    const r = runConformanceSource(
      `g = 7
local function f() local g if g == nil then g = 1 end return g end
assert(f() == 1, "f=" .. tostring(f()))
assert(g == 7, "g=" .. tostring(g))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("bare multi declaration shadows globals", () => {
    const r = runConformanceSource(
      `a = 99
b = 98
assert((function() local a, b if a or b then a = 2 end return a end)() == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: initialized one-line local + if still works", () => {
    const r = runConformanceSource(
      `a = 99
assert((function() local a = 5 if a then a = a + 1 end return a end)() == 6)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: property path before `=` is NOT a bare declaration", () => {
    // `t.x` in RHS position must keep lowering as an expression —
    // the bare-declaration detection is restricted to single-segment
    // plain variables.
    const r = runConformanceSource(
      `local t = {x = 4}
local y = t.x
assert(y == 4)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
