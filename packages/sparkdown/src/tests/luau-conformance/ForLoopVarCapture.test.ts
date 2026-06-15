import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Numeric `for var = start, stop[, step] do ... end` and generic
// `for k, v in iter do ... end` implicitly declare loop variables.
// They're embedded in `LuauForCondition` nodes, NOT in
// `LuauVariableDefinition`, so without explicit handling neither
// `collectImmediateBodyDeclarations` nor `scanFreeVariables` recorded
// them as locally-bound.
//
// Bite: an anonymous function whose body contains a for-loop would
// misclassify the loop variable as a free variable, capture it as an
// upval, and surface as "Duplicate identifier `b`. A parameter named
// `b` already exists for __anon_fn_X" when the for-loop's own runtime
// declaration of `b` then collided with the synthesized upval-param.
//
// Fix: both helpers now walk into LuauForLoop / LuauGenericForLoop
// nodes and add the loop variable name(s) to the locally-bound set.

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
