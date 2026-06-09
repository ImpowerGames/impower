import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// Luau-superset semantics: undefined variable references resolve to
// `nil` (not `0` / ink's IntValue default). Two-part change:
//   - VariableReference.ResolveReferences emits "Cannot find variable
//     named X" as a WARNING instead of an Error so compile-time
//     succeeds. The diagnostic still surfaces in the IDE.
//   - Story's runtime variable-reference lookup pushes `NullValue`
//     (not `IntValue(0)`) when the lookup fails. `tostring(nil)`
//     produces "nil"; interpolation `\`text {undefined}\`` produces
//     the literal "nil"; arithmetic on the result errors via
//     `NullValue.Cast` (matching Lua's runtime trap shape).

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
    // Regression guard — the runtime change only kicks in when the
    // lookup *fails*. A defined local must still resolve to its
    // stored value.
    const r = runConformanceSource(`local x = 42
assert(x == 42 and tostring(x) == "42")`);
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
