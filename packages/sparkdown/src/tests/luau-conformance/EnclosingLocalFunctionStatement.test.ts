import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// `function NAME ... end` whose NAME is a local of an enclosing function
// assigns that local through an upvalue, as Luau's does: the definition is
// `NAME = function ... end`, and NAME resolves to the enclosing local
// (#1349). A NAME that is a local of the same function is assigned in place
// (#415), and a NAME that is no local of any enclosing function is the
// global NAME, which the definition assigns (I-1422).

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

  test("a name no enclosing function declares is reachable after its block in the defining function", () => {
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

// A define's method is a function like any other: a function nested in it
// captures the method's parameters and locals, even one named like a stdlib
// namespace, which is otherwise read as the builtin.
describe("a function nested in a define's method", () => {
  test("a function statement assigns the method's parameter", () => {
    const r = runConformanceSource(`define thing with
  function change(math)
    local function inner()
      function math() return 3 end
    end
    inner()
    return math()
  end
end
assert(thing.change(nil) == 3)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a function statement assigns the method's local", () => {
    const r = runConformanceSource(`define thing with
  function change()
    local math = nil
    local function inner()
      function math() return 3 end
    end
    inner()
    return math()
  end
end
assert(thing.change() == 3)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("reads and writes the method's local", () => {
    const r = runConformanceSource(`define thing with
  function get()
    local math = 5
    local function read() return math end
    local function write() math = 6 end
    local before = read()
    write()
    return before, math
  end
end
local before, after = thing.get()
assert(before == 5, tostring(before))
assert(after == 6, tostring(after))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
