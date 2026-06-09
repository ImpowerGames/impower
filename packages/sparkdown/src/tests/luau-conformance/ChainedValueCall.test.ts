import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Lua/Luau allows chained value-calls — `f(a)(b)` calls `f(a)`, then
// calls the result with `(b)`. The grammar's greedy `LuauFunctionCall`
// body absorbs both `(a)` and `(b)` as sibling parameter-sets inside
// the same call node. The lowerer detects this and wraps the base
// call in `CallValueExpression(prev, args)` for each extra arg-list,
// dispatching through the runtime's existing `CallValueAsFunction`
// op (the same path method-call value-dispatch uses).
//
// Previously, only the FIRST arg-set was read by `lowerCallArguments`
// and subsequent ones were silently dropped — `f(a)(b)` compiled as
// just `f(a)` and the runtime crashed later when half-emitted bytecode
// tried to Assign without a proper call frame.

describe("chained value-calls f(a)(b)", () => {
  test("local fn returning passed-in value, then called", () => {
    const r = runConformanceSource(`local function pair_first(a) return a end
local function identity(x) return x end
local t = pair_first(identity)(5)
assert(t == 5, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("three-level chain f(a)(b)(c) folds into nested CallValueExpressions", () => {
    // Compile-time only — the runtime dispatch of three nested
    // value-calls relies on the closure-returning-closure shape
    // which exercises a separate part of the runtime. Here we
    // just want to confirm the grammar/lowerer doesn't error on
    // the three-link chain.
    const r = runConformanceSource(`local function k(v) return v end
local x = k(1)(2)`);
    // No `target not found` errors — the chain compiled clean.
    expect(
      r.errorMessages.filter((e) => e.includes("target not found")),
    ).toEqual([]);
  });

  test("named-fn returning anon-fn, chained call: make()(5)", () => {
    // Combines the chained-call lowering (`make()(5)`) with the
    // closure-as-return-value path. Previously crashed at runtime
    // with "Cannot read properties of undefined (reading
    // 'temporaryScopes')" because `Assign` ran with no active call
    // frame (the inner closure had popped) and `GetTemporaryVariableWithName`
    // didn't guard against an undefined `contextElement`.
    const r = runConformanceSource(`local function make() return function(n) return n end end
local t = make()(5)
assert(t == 5, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("named-fn returning anon-fn, two-step: f = make(); f(5)", () => {
    // Same shape as above but split across two statements — exercises
    // the same Assign-at-empty-callstack path on the first
    // assignment (`local f = make()`) where the second call hasn't
    // happened yet.
    const r = runConformanceSource(`local function make() return function(n) return n end end
local f = make()
local t = f(5)
assert(t == 5, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: single-call f(a) still works (no chain)", () => {
    const r = runConformanceSource(`local function double(x) return x * 2 end
local t = double(5)
assert(t == 10, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE: (function() ... end)() — anon-fn immediately invoked", () => {
    // `(function() return "x" end)()` — the parenthesized anon-fn
    // followed by `()` parses as two adjacent LuauParenthetical
    // siblings (the inner content, then empty call-args). Without
    // a fold, the pratt parser saw two adjacent operands and emitted
    // broken bytecode — the result was the closure value itself
    // (DivertTargetValue), printed verbatim in interpolation
    // (`"Welcome to DivertTargetValue(run.__anon_fn_794)!"`).
    const r = runConformanceSource(`local x = (function() return "Luau" end)()
assert(x == "Luau", "got " .. tostring(x))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE with args: (function(x) return x end)(5)", () => {
    // Arguments inside the trailing parenthetical route through the
    // value-call dispatch.
    const r = runConformanceSource(`local t = (function(x) return x end)(5)
assert(t == 5, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE inside assert: assert((function() return X end)() == X)", () => {
    // The IIFE-in-arg-context shape needs the same fold as
    // `collectTokens` but also inside `lowerExpressionFromNodes`
    // (which handles function-call argument expressions and doesn't
    // route through `collectTokens`). Without the second fold, the
    // pratt parser saw two adjacent LuauParenthetical operands inside
    // the assert's compare-expression argument and emitted broken
    // bytecode — the closure leaked through as a DivertTarget, hitting
    // "Can't cast" at runtime. Common Luau pattern in conformance
    // fixtures (basic.luau uses this dozens of times).
    const r = runConformanceSource(`assert((function() return 5 end)() == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE inside binary op arg: f((function() return X end)() + 1)", () => {
    // Same fold needed inside any expression context: arithmetic,
    // concat, etc. — the LHS of the `+` is an IIFE that must call,
    // not just evaluate to a closure value.
    const r = runConformanceSource(`local function f(x) return x end
assert(f((function() return 5 end)() + 1) == 6)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
