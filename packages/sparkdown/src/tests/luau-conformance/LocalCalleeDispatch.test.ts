import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Two coupled fixes that let a bare `NAME(args)` call resolve through
// the variable-binding chain when NAME is a local in some enclosing
// scope, including stdlib references stashed in a local.
//
// 1. **Compile-time route** (`lowerExpression.ts`): the `LuauFunctionCall`
//    lowerer now checks `isEnclosingLocalName(NAME)`. If true, emit
//    `CallValueExpression(VariableReference([NAME]), args)` instead of
//    `FunctionCall(NAME, args)`. The latter compiles to a `Divert ->
//    NAME` that errors `target not found: -> NAME` since NAME isn't a
//    knot. Variadic SubFlow names (tracked separately on
//    `siblingSubFlowNamesStack`) are intentionally NOT in this set —
//    they DO resolve via FunctionCall + ink path walk.
//
// 2. **Runtime `__stdlib_fn` dispatch** (`Story.ts`): both the
//    variable-divert path (Divert with hasVariableTarget) AND the
//    `CallValueAsFunction` ControlCommand now recognize an ObjectValue
//    marker with `__stdlib_fn`, look up the entry via `lookupAnyStdLib`,
//    pop its fixed arity off the eval stack, invoke `entry.fn`, and
//    push the result. Variadic stdlib entries (`arity === -1`) fall
//    through to the existing error since the call site can't tell us
//    how many args were pushed. The TODO comment that previously sat
//    by the marker-creation site (Story.ts:~2725) is now resolved for
//    fixed-arity cases.
//
// Survey impact: basic.luau, closure.luau, and tables.luau all advance
// from compile-error to runtime-error (so 5 compile → 2 compile, 22
// runtime → 25 runtime). basic.luau's new blocker is a runtime
// assertion in a variadic-closure-needs-upvals case that's a separate
// limitation.

describe("local-bound callable dispatch", () => {
  test("compile route: local user-fn called from inner closure", () => {
    // basic.luau line ~64 shape — the IIFE captures `helper` (a local
    // in an outer scope) and the inner fn calls it.
    const r = runConformanceSource(
      `function helper() return 7 end\n` +
      `assert((function() local h = helper function inner() return h() end return inner() end)() == 7)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("runtime: variable-divert dispatch on `__stdlib_fn` marker", () => {
    // The marker is created when a stdlib name (e.g. `math.abs`) is
    // read as a value rather than called. Prior to this fix, calling
    // through that local emitted a Divert at compile time and a
    // "non-function value" error at runtime if compile somehow passed.
    const r = runConformanceSource(
      `local abs = math.abs\nassert(abs(-5) == 5)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("runtime: stdlib_fn marker in an IIFE, called directly", () => {
    const r = runConformanceSource(
      `assert((function() local abs = math.abs return abs(-5) end)() == 5)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("runtime: stdlib_fn marker captured by inner closure (basic.luau-803)", () => {
    // basic.luau line 803 — the canonical case. `abs` is a local in
    // the IIFE; the inner `function foo()` captures it as upval; calls
    // `abs(-5)` from the closure body. The CallValueAsFunction handler
    // unboxes the marker and dispatches to math.abs.
    const r = runConformanceSource(
      `assert((function() local abs = math.abs function foo() return abs(-5) end return foo() end)() == 5)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: bare stdlib calls still work", () => {
    const r = runConformanceSource(
      `assert(math.abs(-7) == 7)\nassert(tostring(42) == "42")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: top-level user function calls still work", () => {
    const r = runConformanceSource(
      `function helper(x) return x * 2 end\nassert(helper(3) == 6)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: variadic sibling SubFlow call still routes via Divert", () => {
    // Variadic fn names are deliberately excluded from the
    // local-callee route — they DO resolve via FunctionCall + ink
    // path walk (this is the entire point of the variadic SubFlow
    // skip). Verify it still works.
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
});
