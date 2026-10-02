// A function value captures the outer locals it reads, as Luau binds each
// read: a local of the same name declared in a function nested in it, or
// later in its own body, is another variable and does not stop the capture
// (#1333). That holds for a `local function` and for a function statement
// in a nested function as it does for a `local`.

import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("a closure captures the outer local it reads", () => {
  test.each([
    [
      "a nested function declares a local of the same name",
      "local x = 7\nlocal f = function()\n  local g = function()\n    local x = 3\n    return x\n  end\n  return x + g() - 3\nend\nassert(f() == 7)\n",
    ],
    [
      "a nested function takes a parameter of the same name",
      "local x = 7\nlocal f = function()\n  local g = function(x) return x end\n  return x + g(0)\nend\nassert(f() == 7)\n",
    ],
    [
      "the body declares a local of the same name after the read",
      "local x = 7\nlocal f = function()\n  local y = x\n  local x = 3\n  return y + x - 3\nend\nassert(f() == 7)\n",
    ],
    [
      "a block in the body declares a local of the same name",
      "local x = 7\nlocal f = function()\n  do\n    local x = 3\n  end\n  return x\nend\nassert(f() == 7)\n",
    ],
    [
      "a loop in the body declares a variable of the same name",
      "local x = 7\nlocal f = function()\n  for x = 1, 2 do end\n  return x\nend\nassert(f() == 7)\n",
    ],
  ])("%s", (_name, source) => {
    const r = runConformanceSource(source);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("a parameter of the same name is the closure's own", () => {
    const r = runConformanceSource(
      "local x = 7\nlocal f = function(x) return x end\nassert(f(3) == 3)\n",
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

// A `local function`, or a function statement in a nested function, binds
// through its local, as a `local` does (#1333, round 3 of the review of PR
// #1324).
describe("a function of the same name declared elsewhere is another variable", () => {
  test.each([
    [
      "declared in a nested function",
      `local x = 7
local f = function()
  local g = function()
    local function x() return 3 end
    return x()
  end
  return x + g() - 3
end
assert(f() == 7)`,
    ],
    [
      "declared after the read",
      `local x = 7
local f = function()
  local y = x
  local function x() return 3 end
  return y + x() - 3
end
assert(f() == 7)`,
    ],
    [
      "declared in a block",
      `local x = function() return 7 end
local f = function()
  do
    local function x() return 3 end
    assert(x() == 3)
  end
  return x()
end
assert(f() == 7)`,
    ],
    [
      "a function statement in a nested function names the outer local",
      `local x = 7
local f = function()
  local a = x
  local g = function()
    function x() return 3 end
    return x()
  end
  return a + g() - 3
end
assert(f() == 7)`,
    ],
    [
      "declared in a function beside one that reads the outer local",
      `local x = 7
local f = function()
  local h = function() return x end
  local g = function()
    local function x() return 3 end
    return x()
  end
  return h() + g() - 3
end
assert(f() == 7)`,
    ],
  ])("%s", (_name, source) => {
    const r = runConformanceSource(source);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test.each([
    [
      "a local's initializer reads the outer local",
      `local x = 7
local f = function()
  local x = x + 1
  return x
end
assert(f() == 8)`,
    ],
    [
      "a write to the outer local beside a nested local of its name",
      `local x = 7
local f = function()
  local g = function() local x = 3 return x end
  x = 9
  return g()
end
assert(f() == 3)
assert(x == 9)`,
    ],
    [
      "a returned closure keeps the outer cell",
      `local function make()
  local x = 7
  return function()
    local g = function() local x = 3 return x end
    x += 1
    return x + g() - 3
  end
end
local f = make()
assert(f() == 8)
assert(f() == 9)`,
    ],
  ])("%s", (_name, source) => {
    const r = runConformanceSource(source);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  // A function statement names the function's own function in every read
  // inside it, though the name is an outer local's (basic.luau line 342).
  test.each([
    [
      "in the function's body",
      `local x = function() return 7 end
local f = function()
  function x() return 3 end
  return x()
end
assert(f() == 3)`,
    ],
    [
      "in a block of the function's body",
      `local x = function() return 7 end
local f = function()
  do
    function x() return 3 end
  end
  return x()
end
assert(f() == 3)`,
    ],
    [
      "variadic, in the function's body",
      `local function x(a, b) return b end
local f = function()
  function x(y, ...)
    local a, b, c = ...
    return a + b + c
  end
  return x(1, 2, 3, 4)
end
assert(f() == 9)`,
    ],
  ])("a function statement %s binds the name", (_name, source) => {
    const r = runConformanceSource(source);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
