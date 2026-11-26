import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

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
