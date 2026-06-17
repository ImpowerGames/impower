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

// Upvalues over BLOCK-scoped locals — Lua closes an upvalue when the
// block that declared the variable exits, not only at function
// return. Two runtime bugs broke this:
//
//   1. `Element.PopScope` dropped the scope Map without closing
//      upvalues pointing at its locals, so the pointer survived to
//      the frame pop — by which time the binding was gone and the
//      close-on-pop "closed" it with null.
//   2. `VariablePointerValue.isClosed` was `closedValue !== null`,
//      so that null-close left the pointer dangling OPEN at a stale
//      contextIndex. The next call at the same stack depth bound the
//      pointer into its own target slot — a self-referential pointer
//      that sent reads into infinite `GetVariableWithName` ⇄
//      `ValueAtVariablePointer` recursion (JS stack overflow).
//
// Fixes: PopScope closes upvalues whose variable is bound in the
// popping scope (with the live value), and closed-ness is an explicit
// flag so closed-with-nil is representable. Unlocks basic.luau
// lines 68-83.

describe("upvalues over block-scoped locals (close at scope exit)", () => {
  test("closure over do-block local escapes the block (basic.luau line 68)", () => {
    const r = runConformanceSource(
      `assert((function() function foo() local f do local a = 1 f = function () return a end end local b = 2 return f end return foo()() end)() == 1)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("escaped do-block closure called while frame is still live", () => {
    // Same shape but f() runs INSIDE foo — exercises the scope-pop
    // close (value must be 1, not nil) without any frame pop.
    const r = runConformanceSource(
      `function foo()
  local f
  do
    local a = 1
    f = function () return a end
  end
  return f()
end
assert(foo() == 1, "got " .. tostring(foo()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("local mutability: capture then reassign (basic.luau line 71)", () => {
    // `a = 2` happens AFTER the closure captures `a` but BEFORE the
    // frame pops — the closure must see 2 (live cell, not a copy).
    const r = runConformanceSource(
      `assert((function() function foo() local a = 1 local function f() return a end a = 2 return f end return foo()() end)() == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("upval mutability: IIFE writes the upval (basic.luau line 74)", () => {
    const r = runConformanceSource(
      `assert((function() function foo() local a = 1 (function () a = 2 end)() return a end return foo() end)() == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("upvalue whose value is nil still closes cleanly", () => {
    // closed-with-nil must read as nil, not dangle open (the exact
    // sentinel-conflation that caused the stack overflow).
    const r = runConformanceSource(
      `function foo()
  local f
  do
    local a
    f = function () return a end
  end
  return f
end
assert(foo()() == nil)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
