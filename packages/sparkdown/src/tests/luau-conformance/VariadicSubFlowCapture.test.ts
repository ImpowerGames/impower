import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Variadic nested functions route through `lowerNestedAsSubFlow`, which
// only registers the SubFlow — there's no `local NAME = closureValue`
// binding emitted (the variadic call site needs static dispatch for
// `PackTuple`, which CallValueAsFunction doesn't pack). Before this
// fix, inner closures referencing such a NAME captured it as an upval
// via `scanFreeVariables` → `VariablePointerExpression(NAME)`. At
// runtime, the pointer resolved to nil since NAME isn't a real
// variable, and the closure body's `NAME(...)` site emitted a Divert
// that couldn't find its target.
//
// Fix: a new `ctx.siblingSubFlowNamesStack` tracks variadic-fn names
// per enclosing-fn scope; `scanFreeVariables` skips capture for any
// name on the stack. The reference falls through to FunctionCall
// dispatch at the call site, which resolves NAME via ink's relative-
// path walk to the SubFlow and routes through static `PackTuple`.

describe("inner closure references a variadic sibling SubFlow", () => {
  test("variadic top-level fn called from inside an IIFE", () => {
    // basic.luau line 354 shape — the trigger case.
    const r = runConformanceSource(
      `function concat(head, ...) return tostring(head) end\n` +
      `assert((function() function foo(...) return ... end return concat(foo(1, 2, 3)) end)() == "1")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("variadic sibling-of-sibling call", () => {
    // basic.luau line 359 shape: `function foo` and `function bar`,
    // bar's body calls foo. Both variadic.
    const r = runConformanceSource(
      `function foo(...) return ... end\n` +
      `function bar(...) return foo(...) end\n` +
      `assert(tostring(bar(1)) == "1")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: non-variadic top-level fn referenced from IIFE", () => {
    // Non-variadic case routes through `lowerNestedNamedFunction`
    // which DOES emit a local binding, so the closure capture should
    // continue to work. This test guards the fix from breaking the
    // already-working non-variadic path.
    const r = runConformanceSource(
      `function helper() return 42 end\n` +
      `assert((function() return helper() end)() == 42)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: local-bound closure still captures locals", () => {
    // The variadic-skip is gated on it being a nested-fn DECLARATION
    // (which routes through `lowerNestedAsSubFlow`). A `local NAME =
    // function(...) ... end` assignment uses lowerVariableDefinition,
    // not the nested-fn path, so NAME is a real local and should
    // still be captured normally.
    const r = runConformanceSource(
      `assert((function() local fn = function() return 99 end return (function() return fn() end)() end)() == 99)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
