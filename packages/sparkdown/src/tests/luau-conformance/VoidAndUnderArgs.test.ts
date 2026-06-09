import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Three related fixes for Luau function-return / arg-binding semantics
// that basic.luau exercises early (line 20 onwards):
//
// 1. **Void coerces to nil in single-value contexts.** A function with
//    no return values pushes a `Void` sentinel at PopFunction time.
//    Single-value consumers (binary ops, comparisons) used to throw
//    "Attempting to perform X on a void value". Now NativeFunctionCall
//    coerces Void → NullValue inline, so `(function() end)() == nil`
//    evaluates to true (matching Luau's empty-return semantics).
//
// 2. **Void counts as zero args in `select` / RunStdLibFunction.** As
//    the syntactically LAST arg of a variadic stdlib call (e.g.
//    `select('#', (function() end)())`), Void is conceptually an
//    empty MultiValue — it spreads to zero values. Earlier args
//    truncate to nil (same as MultiValue truncation rules). So
//    `select('#', (function() end)())` correctly returns 0.
//
// 3. **Under-supplied closure args pad with nil.** The closure
//    dispatch path now respects the call-site arg count (encoded on
//    `CallValueAsFunction(argCount)` and threaded through
//    JSON serialization). When the call site supplied fewer args than
//    the closure's user arity, the runtime pads with `NullValue`
//    inline before extractClosurePath pops user args — so
//    `local function foo(a, b) return b end; foo(1)` binds `b` to
//    nil instead of digging garbage from the caller's eval context.
//
//    To make this work uniformly, both `lowerLuauFunctionDefinition`
//    and `lowerAnonymousFunction` now ALWAYS emit the closure-shaped
//    ObjectValue (even for no-upvals closures), so the
//    `__closure_user_arity` field is always available. The padding
//    logic also handles MultiValue spread correctly: a last-arg
//    MultiValue is spread inline BEFORE the pad-count decision, so
//    `f(g())` where g returns (1, 2, 3) and f takes (a, b, c) fills
//    all three params (no padding needed).

describe("Void in single-value contexts coerces to nil", () => {
  test("empty function compared to nil is true", () => {
    const r = runConformanceSource(
      `assert((function() end)() == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("explicit empty return compared to nil is true", () => {
    const r = runConformanceSource(
      `assert((function() return end)() == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("Void counts as zero args in variadic stdlib calls", () => {
  test("select('#', (function() end)()) == 0", () => {
    const r = runConformanceSource(
      `assert(select('#', (function() end)()) == 0)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("select('#', (function() return end)()) == 0", () => {
    const r = runConformanceSource(
      `assert(select('#', (function() return end)()) == 0)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("select with single-return fn still counts as 1", () => {
    const r = runConformanceSource(
      `assert(select('#', (function() return 42 end)()) == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("select with multi-return fn counts correctly", () => {
    const r = runConformanceSource(
      `assert(select('#', (function() return 1, 2, 3 end)()) == 3)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("under-supplied closure args pad with nil", () => {
  test("single-param fn called with zero args", () => {
    const r = runConformanceSource(
      `local function foo(a) return a end\n` +
      `assert(foo() == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("two-param fn called with one arg (basic.luau line 31)", () => {
    const r = runConformanceSource(
      `local function foo(a, b) return b end\n` +
      `assert(foo(1) == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("three-param fn called with one arg", () => {
    const r = runConformanceSource(
      `local function foo(a, b, c) return c end\n` +
      `assert(foo(1) == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("called arg(s) bind correctly even with padding", () => {
    const r = runConformanceSource(
      `local function foo(a, b) return a end\n` +
      `assert(foo(42) == 42, "got " .. tostring(foo(42)))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: exact arg count still binds correctly", () => {
    const r = runConformanceSource(
      `local function foo(a, b) return b end\n` +
      `assert(foo(1, 2) == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: overflow args still bind correctly", () => {
    const r = runConformanceSource(
      `local function foo(a, b) return b end\n` +
      `assert(foo(1, 2, 3) == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
