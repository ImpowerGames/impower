import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("anonymous IIFE containing a nested named function", () => {
  test("multiline: local function decl inside IIFE", () => {
    const r = runConformanceSource(
      `local r = (function()\n` +
      `  local function foo() return 42 end\n` +
      `  return foo()\n` +
      `end)()\n` +
      `assert(r == 42, "got " .. tostring(r))`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("inline: local function decl inside IIFE", () => {
    const r = runConformanceSource(
      `assert((function() local function foo() return 42 end return foo() end)() == 42)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("inline: non-local function decl inside IIFE", () => {
    const r = runConformanceSource(
      `assert((function() function foo() return 42 end return foo() end)() == 42)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("basic.luau line ~59 shape: nested fn, then call it", () => {
    const r = runConformanceSource(
      `assert((function() local a = 1 function foo() return a end return foo() end)() == 1)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: anonymous fn at top of file still works", () => {
    const r = runConformanceSource(
      `local f = function() return 7 end\nassert(f() == 7)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: top-level named function still works", () => {
    const r = runConformanceSource(
      `function foo() return 7 end\nassert(foo() == 7)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: nested named function (not in IIFE) still works", () => {
    const r = runConformanceSource(
      `function outer() local function foo() return 7 end return foo() end\nassert(outer() == 7)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
