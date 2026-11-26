import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("chained value-calls f(a)(b)", () => {
  test("local fn returning passed-in value, then called", () => {
    const r = runConformanceSource(`local function pair_first(a) return a end
local function identity(x) return x end
local t = pair_first(identity)(5)
assert(t == 5, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("three-level chain f(a)(b)(c) folds into nested CallValueExpressions", () => {
    const r = runConformanceSource(`local function k(v) return v end
local x = k(1)(2)`);
    expect(
      r.errorMessages.filter((e) => e.includes("target not found")),
    ).toEqual([]);
  });

  test("named-fn returning anon-fn, chained call: make()(5)", () => {
    const r = runConformanceSource(`local function make() return function(n) return n end end
local t = make()(5)
assert(t == 5, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("named-fn returning anon-fn, two-step: f = make(); f(5)", () => {
    const r = runConformanceSource(`local function make() return function(n) return n end end
local f = make()
local t = f(5)
assert(t == 5, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: single-call f(a) still works (no chain)", () => {
    const r = runConformanceSource(`local function double(x) return x * 2 end
local t = double(5)
assert(t == 10, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE: (function() ... end)() — anon-fn immediately invoked", () => {
    const r = runConformanceSource(`local x = (function() return "Luau" end)()
assert(x == "Luau", "got " .. tostring(x))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE with args: (function(x) return x end)(5)", () => {
    const r = runConformanceSource(`local t = (function(x) return x end)(5)
assert(t == 5, "got " .. tostring(t))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE inside assert: assert((function() return X end)() == X)", () => {
    const r = runConformanceSource(`assert((function() return 5 end)() == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE inside binary op arg: f((function() return X end)() + 1)", () => {
    const r = runConformanceSource(`local function f(x) return x end
assert(f((function() return 5 end)() + 1) == 6)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
