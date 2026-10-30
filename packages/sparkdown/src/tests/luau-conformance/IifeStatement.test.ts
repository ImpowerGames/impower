import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("IIFE statements", () => {
  test("IIFE statement mutates enclosing local (multi-line body)", () => {
    const r = runConformanceSource(
      `local function f()
  local a = 1
  (function () a = 2 end)()
  return a
end
assert(f() == 2, "got " .. tostring(f()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE statement in one-line body (basic.luau line 50)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 1 (function () a = 2 end)() return a end)() == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE statement at top level", () => {
    const r = runConformanceSource(
      `a = 1
;(function () a = 2 end)()
assert(a == 2, "got " .. tostring(a))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE statement with arguments", () => {
    const r = runConformanceSource(
      `local function f()
  local total = 0
  (function (x, y) total = x + y end)(4, 5)
  return total
end
assert(f() == 9, "got " .. tostring(f()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: one-line function with params still parses", () => {
    const r = runConformanceSource(
      `function add(x, y) return x + y end
local mul = function (x, y) return x * y end
assert(add(2, 3) == 5)
assert(mul(2, 3) == 6)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: bare call statements around a semicolon-guarded IIFE", () => {
    const r = runConformanceSource(
      `local total = 0
local function bump(n) total = total + n end
local function f()
  bump(1)
  ;(function () bump(10) end)()
  bump(100)
end
f()
assert(total == 111, "got " .. tostring(total))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
