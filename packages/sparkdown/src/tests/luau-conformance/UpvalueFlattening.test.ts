import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Upvalue flattening — Lua's rule that re-capturing a captured
// upvalue shares the SAME cell, not a pointer to a pointer.
//
// Closure capture passes upvals as `VariablePointerValue` args, so a
// captured name's slot in the capturing function's frame HOLDS a
// pointer. When a nested closure re-captures that name, the
// auto-resolve in `Story.Step`'s eval-stack push path previously
// created a new pointer AT that slot — double indirection. Reads
// dereference exactly one level (`VariablesState.GetVariableWithName`),
// so the inner closure's `return a` leaked the OUTER pointer raw and
// blew up downstream (`Can't cast 1 from 0 to 5` when compared to an
// Int).
//
// Fix: at auto-resolve time, if the slot being pointed at already
// holds a `VariablePointerValue`, reuse that pointer directly. Every
// nesting level then shares one cell — reads AND writes at any depth
// reach the original variable. Unlocks basic.luau lines 62-65.

describe("upvalue flattening (nested re-capture)", () => {
  test("nested closure reads outer local through middle fn (basic.luau line 62)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 1 function foo() return function() return a end end return foo()() end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("function args are properly closed over (basic.luau line 65)", () => {
    const r = runConformanceSource(
      `assert((function() function foo(a) return function () return a end end return foo(1)() end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("write through a flattened upvalue reaches the original cell", () => {
    // The inner closure WRITES the re-captured upvalue; the outer
    // scope must observe the mutation (single shared cell, not a
    // copy at any level).
    const r = runConformanceSource(
      `local a = 1
function foo()
  return function() a = a + 10 end
end
foo()()
assert(a == 11, "got " .. tostring(a))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("three levels of nesting share one cell", () => {
    const r = runConformanceSource(
      `local a = 5
function l1()
  return function()
    return function() return a end
  end
end
assert(l1()()() == 5, "got " .. tostring(l1()()()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: single-level capture still works", () => {
    // The flattening check must not disturb the plain one-level
    // capture path (slot holds a VALUE, not a pointer).
    const r = runConformanceSource(
      `local n = 3
local f = function() return n * 2 end
assert(f() == 6)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
