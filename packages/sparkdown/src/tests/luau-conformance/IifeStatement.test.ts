import { describe, expect, test } from "vitest";
import { runConformanceSource } from "./conformanceTestHarness";

// IIFE as a *statement*: `(function () ... end)()`.
//
// Two separate gaps made this silently vanish (no error — the
// statement just never executed, so its upvalue writes were lost):
//
//   1. Lowerer: at statement level the shape parses as two adjacent
//      sibling `LuauParenthetical` nodes (value + call parens), but
//      `lowerStatements`'s dispatcher had no case for
//      `LuauParenthetical` — both nodes fell through to `default:
//      undefined`. Fixed by folding a parenthetical run into one
//      `CallValueExpression` statement (popping the unused return),
//      mirroring the expression-context fold in `collectTokens`.
//
//   2. Grammar: in a ONE-LINE function body (`function f() ... end`
//      with no newline), `LuauFunctionBody` never opens (its begin
//      requires `\n`), so statements parse directly inside
//      `LuauFunctionDefinition_content` — where the
//      `LuauFunctionParameters` rule is still live and matched the
//      IIFE's `(` as a bogus second parameter list. Fixed by
//      anchoring `LuauFunctionParameters.begin` with a header-position
//      lookbehind (identifier / `function` keyword / generics `>`).
//
// Unlocks basic.luau line 50.

describe("IIFE statements", () => {
  test("IIFE statement mutates enclosing local (multi-line body)", () => {
    const r = runConformanceSource(
      `local function f()
  local a = 1
  (function () a = 2 end)()
  return a
end
assert(f() == 2, "got " .. tostring(f()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE statement in one-line body (basic.luau line 50)", () => {
    const r = runConformanceSource(
      `assert((function() local a = 1 (function () a = 2 end)() return a end)() == 2)`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE statement at top level", () => {
    const r = runConformanceSource(
      `a = 1
;(function () a = 2 end)()
assert(a == 2, "got " .. tostring(a))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("IIFE statement with arguments", () => {
    const r = runConformanceSource(
      `local function f()
  local total = 0
  (function (x, y) total = x + y end)(4, 5)
  return total
end
assert(f() == 9, "got " .. tostring(f()))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: one-line function with params still parses", () => {
    // The header-position lookbehind must keep matching the REAL
    // parameter list — named, anonymous (space before parens), and
    // method-style headers.
    const r = runConformanceSource(
      `function add(x, y) return x + y end
local mul = function (x, y) return x * y end
assert(add(2, 3) == 5)
assert(mul(2, 3) == 6)`,
    );
    expect(r.errorMessages).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });

  test("regression: bare call statements around a semicolon-guarded IIFE", () => {
    // A bare call statement inside a function body lowers via the
    // AccessPath + Parenthetical pairing — make sure the new
    // parenthetical-run handling doesn't interfere. The `;` before
    // the IIFE is REQUIRED, exactly as in real Luau: without it,
    // `bump()` followed by `(`-on-a-new-line is the classic Lua
    // call-continuation ambiguity (Luau rejects it with "ambiguous
    // syntax"; sparkdown pairs the parens with the preceding call).
    const r = runConformanceSource(
      `local total = 0
local function bump(n) total = total + n end
local function f()
  bump(1)
  ;(function () bump(10) end)()
  bump(100)
end
f()
assert(total == 111, "got " .. tostring(total))`,
    );
    expect(
      r.errorMessages.filter((e) => !e.startsWith("RUNTIME")),
    ).toEqual([]);
    expect(r.returnedOK).toBe(true);
  });
});
