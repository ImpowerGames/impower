import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("undefined variables resolve to nil", () => {
  test("tostring(undefined) produces 'nil'", () => {
    const r = runConformanceSource(
      `assert(tostring(undefined_var) == "nil", "got " .. tostring(undefined_var))`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("interpolation: `text {undefined}` produces 'text nil'", () => {
    const r = runConformanceSource(
      `local s = \`This {undefined_var}\`
assert(s == "This nil", "got " .. s)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("undefined == nil is true", () => {
    const r = runConformanceSource(`assert(undefined_var == nil)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("declared vars unchanged: defined vars resolve normally", () => {
    const r = runConformanceSource(`local x = 42
assert(x == 42 and tostring(x) == "42")`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
