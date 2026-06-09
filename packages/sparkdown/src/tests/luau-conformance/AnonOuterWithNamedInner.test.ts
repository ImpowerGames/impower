import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Regression: `getDescendent("LuauFunctionDeclarationName", node)` walks
// the WHOLE subtree depth-first, so an anonymous outer fn containing a
// nested `local function NAME ... end` was mis-classified as named —
// `lowerAnonymousFunction` bailed out, the IIFE never lowered, the
// outer call resolved to nil, and `assert((IIFE)() == X)` failed at
// runtime.
//
// Fix: introduce `findOwnDeclarationName` which scans ONLY the direct
// children of `LuauFunctionDefinition_content`. The header pieces
// (LuauFunctionDeclarationName, LuauFunctionParameters, etc.) all live
// at that level; body content (statements, nested function defs) is
// either deeper (multi-line) or interleaved at the same level
// (inline) — either way, scanning by name without recursion finds the
// OWN header and never the nested function's name. Applied at three
// call sites in `lowerExpression.ts` and the entry of
// `lowerLuauFunctionDefinition.ts`.

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
    // From basic.luau:
    //   assert((function() local a = 1 function foo() return a end return foo() end)() == 1)
    const r = runConformanceSource(
      `assert((function() local a = 1 function foo() return a end return foo() end)() == 1)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  // Note: the deeper basic.luau line-62 shape — `function foo() return
  // function() return a end end` (returning an inner closure that
  // captures `a` as an upval) — hits a separate "Can't cast 1 from 0
  // to 5" bug in the closure-dispatch path. That's a follow-up; the
  // direct `local function NAME ... end` inside an IIFE is the win
  // captured here.

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
