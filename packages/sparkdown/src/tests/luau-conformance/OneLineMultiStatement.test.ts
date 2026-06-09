import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Lua/Luau allows multiple statements on a single source line.
// `function f() local x = 5 return x end` declares a function whose
// body has two statements (the `local` declaration and the `return`).
//
// Sparkdown's grammar already accepts this syntactically — the parse
// tree captures both statements as siblings inside the
// `LuauVariableDefinition_content`. But the lowerer treated all
// non-VA, non-comma siblings as "trailing multi-RHS expression"
// values, silently dropping return / function-def / etc. as garbage
// expression operands.
//
// Fix: `lowerVariableDefinition` recognizes statement-like sibling
// names (LuauReturnStatement, LuauFunctionDefinition, LuauBreakStatement,
// etc.) — collects them into `trailingStatements` and lowers each via
// the main `lower()` dispatcher after the variable assignment. The
// resulting ParsedObjects are appended to the returned weave.
//
// Unlocks the common Luau IIFE-as-test idiom from upstream conformance
// fixtures: `assert((function() local x = 5 return x end)() == 5)`.

describe("one-line multi-statement function bodies", () => {
  test("local + return on one line", () => {
    const r = runConformanceSource(`function f() local x = 5 return x end
assert(f() == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("multiple locals + return on one line", () => {
    const r = runConformanceSource(`function f() local x = 5 local y = 6 return x + y end
assert(f() == 11)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("nested function definition + return on one line", () => {
    const r = runConformanceSource(`function f() local t = {} function t.g() return 42 end return t.g() end
assert(f() == 42)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE with multi-statement one-line body", () => {
    // The canonical Luau `assert(IIFE() == X)` form — the same shape
    // basic.luau and other upstream fixtures use to wrap test cases.
    const r = runConformanceSource(
      `assert((function() local x = 5 return x end)() == 5)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("multi-target local + return on one line", () => {
    const r = runConformanceSource(`function f() local a, b = 1, 2 return a + b end
assert(f() == 3)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: multi-line body still works", () => {
    // Make sure the trailing-statement detection didn't break the
    // common multi-line form.
    const r = runConformanceSource(`function f()
  local x = 5
  return x
end
assert(f() == 5)`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
