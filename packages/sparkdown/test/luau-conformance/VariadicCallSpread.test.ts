import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

const CONCAT_HELPER = `function concat(head, ...) if select('#', ...) == 0 then return tostring(head) else return tostring(head) .. "," .. concat(...) end end`;

describe("multi-return spread at variadic call sites", () => {
  test("PackTuple(0) spreads a MultiValue into the regular arg + vararg", () => {
    const r = runConformanceSource(
      `local function f(head, ...) return select('#', ...) end\n` +
      `local n = f(pcall(function() return nil end))\n` +
      `assert(n == 1, "vararg count = " .. tostring(n))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("concat(pcall(...)) with nil return — basic.luau line 37", () => {
    const r = runConformanceSource(
      `${CONCAT_HELPER}\n` +
      `assert(concat(pcall(function() return nil end)) == "true,nil")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("concat(pcall(empty fn)) — basic.luau line 36", () => {
    const r = runConformanceSource(
      `${CONCAT_HELPER}\n` +
      `assert(concat(pcall(function() end)) == "true")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("concat(pcall(fn returning 1, 2, 3)) — basic.luau line 38", () => {
    const r = runConformanceSource(
      `${CONCAT_HELPER}\n` +
      `assert(concat(pcall(function() return 1, 2, 3 end)) == "true,1,2,3")`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: variadic call with single non-MV last arg", () => {
    const r = runConformanceSource(
      `local function f(head, ...) return select('#', ...) end\n` +
      `assert(f(42) == 0)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: variadic call with multi extras", () => {
    const r = runConformanceSource(
      `local function f(head, ...) return select('#', ...) end\n` +
      `assert(f(1, 2, 3, 4) == 3)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.includes("Can't use a divert target")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
