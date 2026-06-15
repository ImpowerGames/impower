import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Luau-superset semantics: a `local x` (temp variable) must shadow
// any same-named global for BOTH reads and writes. Ink's original
// `GetRawVariableWithName` / `Assign` checked globals first; this
// works for ink because temps were rare `~temp x` declarations
// scoped to knots (no collision with global names). Sparkdown's
// `local x = …` is the common case and overlaps with auto-globals,
// so the order is now flipped to temps-first.
//
// Two-part fix:
//   - GetRawVariableWithName checks the call-stack temporaries
//     before the global map.
//   - Assign sets `setGlobal` only when no temp with that name is
//     in scope — otherwise writes to the temp (matters for
//     `local function NAME` self-recursive declarations, whose
//     lowering emits `local x = nil; x = closure` and relies on
//     both writes landing in the temp slot).

describe("locals shadow same-named globals", () => {
  test("simple shadow: local x = 1 over global x = 2", () => {
    const r = runConformanceSource(`x = 2
do
  local x = 1
  assert(x == 1)
end
assert(x == 2)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("local function shadows global of same name (no recursion)", () => {
    const r = runConformanceSource(`g = false
do
  local function g() return 42 end
  assert(g() == 42)
end
assert(g == false)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("local function self-recursion with same-named outer global", () => {
    // The two-step lowering emits `local g = nil; g = closure`.
    // The second write must land in the local TEMP slot, not the
    // outer GLOBAL. Without the Assign fix, the closure overwrote
    // the global and the local stayed at nil — the recursive call
    // then crashed with "g contained 'nil'".
    const r = runConformanceSource(`g = false
do
  local function g(n) if n==0 then return 1 else return g(n-1) end end
  assert(g(3) == 1)
end
assert(g == false)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("calls.luau line 21-31 shape: fact = false + local function fact", () => {
    // Exact pattern from the upstream Luau conformance suite.
    const r = runConformanceSource(`fact = false
do
  local res = 1
  local function fact (n)
    if n==0 then return res
    else return n*fact(n-1)
    end
  end
  assert(fact(5) == 120)
end
assert(fact == false)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: write to existing global (no local in scope) still hits global", () => {
    // The shadow check should ONLY redirect writes when a temp is
    // actually in scope. Plain `x = 5` outside any local declaration
    // must still write to the global.
    const r = runConformanceSource(`x = 1
x = 5
assert(x == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: temps with no same-named global still work", () => {
    // The temps-first lookup must not break the common case where
    // no global shadows the temp.
    const r = runConformanceSource(`local x = 7
assert(x == 7)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
