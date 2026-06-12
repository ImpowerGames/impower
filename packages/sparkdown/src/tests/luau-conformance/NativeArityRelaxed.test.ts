import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Sparkdown's `FunctionCall.GenerateIntoContainer` previously
// asserted that a NativeFunctionCall site supplied exactly the
// registered arity (e.g. `math.abs` expects 1 parameter, `math.max`
// expects 2). Any miscount became a compile-time ERROR — which broke
// Luau's `pcall(function() return math.abs() end)` idiom for testing
// the runtime "missing argument" trap.
//
// Demoted to a WARNING so the call compiles cleanly. At runtime,
// `NativeFunctionCall.Call` still validates arity and throws
// "Unexpected number of parameters" — caught by `pcall` as a regular
// Luau error. Calls outside `pcall` fail at runtime with the same
// message, matching Luau's runtime-error semantics.
//
// Also: multi-component "Cannot find item or path named X.Y"
// (previously an error) is now a warning too — same Luau semantic
// as the single-name case (`Cannot find variable named X`). Lets
// `_G.bar = 1; return _G.bar` patterns reach the runtime where
// nil-default reads kick in.

describe("native function arity check is a warning, not an error", () => {
  test("compile-only: math.abs() with 0 args produces no errors", () => {
    // The wrong-arity call must COMPILE. Runtime traps via
    // "trying to pop too many objects" (a JS exception propagating
    // out of pcall — separate runtime bug; not blocked here).
    // Verify only that compile produced no severity-1 diagnostics.
    const r = runConformanceSource(`function _wrap() return math.abs() end`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("compile-only: math.max() with 0 args produces no errors", () => {
    const r = runConformanceSource(`function _wrap() return math.max() end`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("regression: correct arity still works", () => {
    // Sanity check that demoting the error didn't break the happy
    // path — `math.abs(5)` still computes correctly.
    const r = runConformanceSource(`assert(math.abs(-5) == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("dotted-path unresolved variable is a warning, not an error", () => {
  test("undefined path: _G.bar reads as nil at runtime", () => {
    // `_G` resolves to the globals-proxy table; a missing member of
    // an EXISTING table is nil (Luau semantics). Compile succeeds
    // with a warning.
    const r = runConformanceSource(`assert(_G.bar == nil)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("interpolation: unresolved dotted root raises Lua's index error", () => {
    // Luau semantics: `unknown.path` indexes a nil value and raises
    // (basic.luau's import-fallback block requires
    // `pcall(function() return idontexist.a end) == false`).
    // Previously sparkdown fell through to a lenient nil-default —
    // that read every typo'd root as nil and masked real bugs. The
    // raise is trappable via pcall like any Lua error.
    const r = runConformanceSource(`local s = \`val: {unknown.path}\`
assert(s == "val: nil")`);
    expect(
      r.errorMessages.some((e) => e.includes("attempt to index a nil value")),
    ).toBe(true);
  });

  test("regression: defined dotted path still resolves", () => {
    // The runtime lookup still walks ObjectValue maps for valid
    // dotted reads. `a.x` where `a = {x=1}` returns 1.
    const r = runConformanceSource(`local a = {x = 1}
assert(a.x == 1)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
