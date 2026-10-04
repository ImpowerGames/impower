// Additional boundaries for Luau's MisleadingAndOr and ComparisonPrecedence rules.
import { describe, expect, test } from "vitest";
import { diagnoseDetailed, lintMessagesInFunction } from "./diagnosticTestHarness";

const OPS = ["==", "~=", "<", "<=", ">", ">="];
const equality = (op: string) => op === "==" || op === "~=";

describe("expression precedence warnings", () => {
  test.each(OPS)("negation before %s and explicit groups", (op) => {
    expect(lintMessagesInFunction(`local a, b = ...
local _ = not a ${op} b
local _ = (not a) ${op} b
local _ = not (a ${op} b)
local _ = not a ${op} not b
`)).toEqual([
      equality(op)
        ? `not X ${op} Y is equivalent to (not X) ${op} Y; consider using X ${op === "==" ? "~=" : "=="} Y, or add parentheses to silence`
        : `not X ${op} Y is equivalent to (not X) ${op} Y; add parentheses to silence`,
    ]);
  });

  test.each(OPS)("comparison chains beginning with %s", (left) => {
    const expressions = OPS.map((right) => `local _ = a ${left} b ${right} c`).join("\n");
    expect(lintMessagesInFunction(`local a, b, c = ...\n${expressions}\n`)).toEqual(OPS.map((right) =>
      equality(left) || equality(right)
        ? `X ${left} Y ${right} Z is equivalent to (X ${left} Y) ${right} Z; add parentheses to silence`
        : `X ${left} Y ${right} Z is equivalent to (X ${left} Y) ${right} Z; did you mean X ${left} Y and Y ${right} Z?`,
    ));
  });

  test("parentheses silence chains and literal alternatives; nested expressions remain checked", () => {
    expect(lintMessagesInFunction(`local a, b, c = ...
local _ = (a < b) < c
local _ = a < (b < c)
local _ = a and (false) or c
local _ = a and (nil) or c
local _ = a and 0 or c
local _ = a and "" or c
local _ = (a and nil) or c
local _ = tostring(not a == b)
local _ = a and b and false or c
`)).toEqual([
      "not X == Y is equivalent to (not X) == Y; consider using X ~= Y, or add parentheses to silence",
      "The and-or expression always evaluates to the second alternative because the first alternative is false; consider using if-then-else expression instead",
    ]);
  });

  test("warning ranges cover the entire authored expression", () => {
    const source = "function run(a, b)\n  local _ = not a == b\n  local _ = a and nil or b\nend\n";
    expect(diagnoseDetailed(source).filter((d) => d.code === "ComparisonPrecedence" || d.code === "MisleadingAndOr")
      .map((d) => ({ code: d.code, severity: d.severity, range: d.range }))).toEqual([
        { code: "ComparisonPrecedence", severity: 2, range: { start: { line: 1, character: 12 }, end: { line: 1, character: 22 } } },
        { code: "MisleadingAndOr", severity: 2, range: { start: { line: 2, character: 12 }, end: { line: 2, character: 26 } } },
      ]);
  });
});
