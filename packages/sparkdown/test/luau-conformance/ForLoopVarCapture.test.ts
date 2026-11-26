import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

describe("for-loop variable is treated as locally bound", () => {
  test("numeric for inside anonymous function compiles (basic.luau-178)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 1 for b=1,9 do a = a * 2 end return a end)() == 512)`,
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
  });

  test("generic for inside anonymous function compiles", () => {
    const r = runConformanceSource(
      `assert((function() local s = "" local t = {1,2,3} for k, v in ipairs(t) do s = s .. v end return s end)() == "123")`,
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
  });

  test("for-loop variable shadowing outer local doesn't crash", () => {
    const r = runConformanceSource(
      `local b = "outer"\nassert((function() local sum = 0 for b=1,3 do sum = sum + b end return sum end)() == 6)`,
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
  });

  test("nested for-loops in closure body compile cleanly", () => {
    const r = runConformanceSource(
      `local r = (function() local total = 0 for i=1,3 do for j=1,2 do total = total + 1 end end return total end)()\nassert(r == 6)`,
    );
    expect(
      r.errorMessages.filter(
        (e) => !e.startsWith("RUNTIME") && !e.includes("Can't use a divert target"),
      ),
    ).toEqual([]);
  });
});
