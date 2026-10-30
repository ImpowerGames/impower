import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("Luau auto-global bare-call dispatch", () => {
  test("Y = function...; Y(F) — closure stored in auto-global", () => {
    const r = runConformanceSource(`Y = function(le) return le end
F = 42
fat = Y(F)
assert(fat == 42, "got " .. tostring(fat))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("local Y baseline — already worked", () => {
    const r = runConformanceSource(`local Y = function(le) return le end
local F = 7
local fat = Y(F)
assert(fat == 7, "got " .. tostring(fat))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("re-assignment to auto-global doesn't duplicate-register", () => {
    const r = runConformanceSource(`Y = function() return 1 end
Y = function() return 2 end
assert(Y() == 2, "got " .. tostring(Y()))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("auto-global with non-function value — referenceable", () => {
    const r = runConformanceSource(`x = 42
assert(x == 42, "got " .. tostring(x))`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
