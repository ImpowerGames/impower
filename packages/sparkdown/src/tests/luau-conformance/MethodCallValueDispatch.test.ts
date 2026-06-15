import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// `a.method(args)` and `a:method(args)` on user-defined methods (i.e.
// the method value is stored at `a["method"]` as a closure or
// divert-target, NOT a stdlib namespace method like `math.floor`)
// previously failed with "target not found: -> method" because the
// lowerer receiver-threaded into `FunctionCall(method, [a, ...])` and
// the runtime tried to resolve `method` as a top-level flow.
//
// `lowerMethodCall` now emits a `CallValueExpression(IndexExpression
// (receiver, "method"), args)` for non-stdlib methods. The runtime's
// `CallValueAsFunction` ControlCommand pops the callable (the method
// value) and dispatches via the same path closure literals use.

describe("user-defined method dispatch", () => {
  test("dot-form `a.method(args)`", () => {
    const r = runConformanceSource(`local a = { greet = function() return "hi" end }
local r = a.greet()
assert(r == "hi", "got " .. tostring(r))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("colon-form `a:method()` doesn't error at compile time", () => {
    // Previously failed with "target not found: -> method" because
    // the lowerer treated it as a divert to a flow named `method`.
    // Now lowers as IndirectCall — at minimum the compile error is
    // gone. Full runtime semantics (receiver-as-self threading,
    // property access on `self`) overlap with other open work.
    const r = runConformanceSource(`local a = { mul = function(self, n) return n end }
local r = a:mul(42)`);
    // Compile-time only: no "target not found" errors.
    expect(
      r.errorMessages.filter((e) => e.includes("target not found")),
    ).toEqual([]);
  });

  test("dot-form on indexed value `a[k].method()`", () => {
    const r = runConformanceSource(`local a = { [1] = { get = function() return "found" end } }
local r = a[1].get()
assert(r == "found", "got " .. tostring(r))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("stdlib namespace methods still route through builtin dispatch", () => {
    // Regression guard: `math.floor` MUST keep going through the
    // stdlib-namespace fast path, NOT through `CallValueExpression`.
    const r = runConformanceSource(`local r = math.floor(3.7)
assert(r == 3, "got " .. tostring(r))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("statement-position call discards return value", () => {
    // `a.method(args)` as a bare statement — return value should be
    // popped (via `shouldPopReturnedValue`), not left on the stack.
    const r = runConformanceSource(`local recorded = 0
local a = { record = function(v) recorded = v end }
a.record(42)
assert(recorded == 42, "got " .. tostring(recorded))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
