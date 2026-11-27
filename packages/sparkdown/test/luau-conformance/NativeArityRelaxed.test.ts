import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("native function arity check is a warning, not an error", () => {
  test("compile-only: math.abs() with 0 args produces no errors", () => {
    const r = runConformanceSource(`function _wrap() return math.abs() end`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("compile-only: math.max() with 0 args produces no errors", () => {
    const r = runConformanceSource(`function _wrap() return math.max() end`);
    expect(r.errorMessages.filter((e) => !e.startsWith("RUNTIME"))).toEqual([]);
  });

  test("regression: correct arity still works", () => {
    const r = runConformanceSource(`assert(math.abs(-5) == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});

describe("dotted-path unresolved variable is a warning, not an error", () => {
  test("undefined path: _G.bar reads as nil at runtime", () => {
    const r = runConformanceSource(`assert(_G.bar == nil)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("interpolation: unresolved dotted root raises Lua's index error", () => {
    const r = runConformanceSource(`local s = \`val: {unknown.path}\`
assert(s == "val: nil")`);
    expect(
      r.errorMessages.some((e) => e.includes("attempt to index nil with 'path'")),
    ).toBe(true);
  });

  test("regression: defined dotted path still resolves", () => {
    const r = runConformanceSource(`local a = {x = 1}
assert(a.x == 1)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
