import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Two coupled fixes that unlock `self` capture in nested anonymous
// functions inside method bodies (the basic.luau line-3548 shape).
//
// 1. `scanFreeVariables` recognizes `LuauSelfKeyword` as a name
//    source. The grammar tags `self` as `LuauSelfKeyword` (not
//    `LuauVariableName`), so the scanner's `getDescendent("LuauVariableName")`
//    silently dropped `self` references — they were never added to
//    the inner closure's upval list.
//
// 2. `self` removed from `STDLIB_NAMES_FOR_FREE_VAR_SCAN`. Even with
//    (1), `self` was being treated as a stdlib global and skipped
//    by `maybeCaptureFree`. `self` is a regular parameter (implicit
//    for colon-form methods, explicit for dot-form), never a stdlib-
//    resolved global, so it MUST be captured to reach the inner
//    closure's frame.
//
// Combined: an inner anonymous function inside a method body now
// captures `self` correctly, and the runtime VariablePointerValue
// resolves it to the outer frame's method-receiver slot.

describe("self capture in nested anonymous functions", () => {
  test("colon-method body: nested IIFE captures self", () => {
    const r = runConformanceSource(`local t = {f=5}
function t:get() return (function() return self.f end)() end
local r = t:get()
assert(r == 5, "got " .. tostring(r))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("dot-method body with self user-param: nested IIFE captures self", () => {
    const r = runConformanceSource(`local t = {f=5}
function t.get(self) return (function() return self.f end)() end
local r = t.get(t)
assert(r == 5, "got " .. tostring(r))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("basic.luau line-3548 exact shape", () => {
    // The canonical Luau test idiom from basic.luau lines 3548+:
    //   assert((function()
    //     local t = {f=5}
    //     function t:get() return (function() return self.f end)() end
    //     return t:get()
    //   end)() == 5)
    const r = runConformanceSource(
      `assert((function() local t = {f=5} function t:get() return (function() return self.f end)() end return t:get() end)() == 5)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: direct self.field read in colon body still works", () => {
    const r = runConformanceSource(`local t = {f=5}
function t:get() return self.f end
assert(t:get() == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("dot vs colon dispatch — dotted-name fn def: dot does NOT prepend self", () => {
    // Regression guard for the LuauFunctionAccessor dispatch fix:
    // `function t.get(self) ...` should NOT have an extra implicit
    // self prepended (was happening because the lowerer dispatched
    // on the access-part node name, not the operator text).
    const r = runConformanceSource(`local t = {f=5}
function t.get(self) return self.f end
assert(t.get(t) == 5)`);
    // Specifically check no "Multiple arguments with the same name"
    // diagnostic in either errorMessages or warningMessages.
    const allDiagnostics = [...r.errorMessages, ...r.warningMessages];
    expect(
      allDiagnostics.filter((d) => d.includes("Multiple arguments with the same name")),
    ).toEqual([]);
  });
});
