import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

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
    const r = runConformanceSource(`local t = {f=5}
function t.get(self) return self.f end
assert(t.get(t) == 5)`);
    const allDiagnostics = [...r.errorMessages, ...r.warningMessages];
    expect(
      allDiagnostics.filter((d) => d.includes("Multiple arguments with the same name")),
    ).toEqual([]);
  });
});
