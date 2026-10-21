import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// `function NAME ... end` whose NAME is a local of an enclosing function
// assigns that local through an upvalue, as Luau's does: the definition is
// `NAME = function ... end`, and NAME resolves to the enclosing local
// (#1349). A NAME that is a local of the same function is assigned in place
// (#415), and a NAME that is no local of any enclosing function keeps its
// hoisted binding in the function that defines it.

describe("function statement naming an enclosing function's local", () => {
  test("assigns the enclosing local", () => {
    const r = runConformanceSource(`local function g() return 1 end
local function changeFixed() function g() return 3 end end
changeFixed()
assert(g() == 3, tostring(g()))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a variadic definition assigns the enclosing local", () => {
    const r = runConformanceSource(`local function g() return 1 end
local function changeFixed() function g(...) return select("#", ...) + 3 end end
changeFixed()
assert(g() == 3, tostring(g()))
assert(g(1, 2) == 5, tostring(g(1, 2)))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("assigns a local defined two functions up", () => {
    const r = runConformanceSource(`local function g() return 1 end
local function outer()
  local function inner() function g() return 3 end end
  inner()
end
outer()
assert(g() == 3, tostring(g()))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("assigns a parameter of the enclosing function", () => {
    const r = runConformanceSource(`local function outer(g)
  local function change() function g() return 3 end end
  change()
  return g()
end
assert(outer(nil) == 3, tostring(outer(nil)))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("the defining function and other closures see the new value", () => {
    const r = runConformanceSource(`local g = nil
local function get() return g() end
local function change()
  function g() return 3 end
  return g()
end
assert(change() == 3)
assert(get() == 3, tostring(get()))
assert(g() == 3, tostring(g()))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a local of the same function is assigned in place", () => {
    const r = runConformanceSource(`local function g() return 1 end
function g() return 3 end
assert(g() == 3, tostring(g()))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a name no enclosing function declares stays in the defining function", () => {
    const r = runConformanceSource(`local function f()
  do
    function h() return 5 end
  end
  return h()
end
assert(f() == 5, tostring(f()))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
