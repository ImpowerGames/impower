// MisleadingAndOr and ComparisonPrecedence (I-611). The upstream cases are in
// `luau-conformance/LintCandidatesStyle.test.ts` (MisleadingAndOr,
// ComparisonPrecedence); these are the controls around them: every
// comparison operator, the ranges, the escape hatches Luau gives, code
// written in a type or holding a syntax error, and code outside functions.

import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "../luau-conformance/diagnosticTestHarness";

const CODES = new Set(["MisleadingAndOr", "ComparisonPrecedence"]);
const lints = (source: string) => diagnoseDetailed(source).filter((d) => CODES.has(String(d.code)));
const messages = (source: string) => lints(source).map((d) => d.message);
const inFunction = (body: string) => messages(`& run()\nfunction run(a, b, c)\n${body}\nend\n`);
/** Each warning's code and the text its range covers. */
const covered = (source: string) => {
  const lines = source.split("\n");
  return lints(source).map((d) => ({ code: d.code, text: lines[d.range!.start.line]!.slice(d.range!.start.character, d.range!.end.character) }));
};

const OPS = ["==", "~=", "<", "<=", ">", ">="];
const equality = (op: string) => op === "==" || op === "~=";

describe("ComparisonPrecedence", () => {
  test.each(OPS)("not before %s, silenced by either grouping and by a negated right side", (op) => {
    expect(inFunction(` print(not a ${op} b)\n print((not a) ${op} b)\n print(not (a ${op} b))\n print(not a ${op} not b)`)).toEqual([
      equality(op)
        ? `not X ${op} Y is equivalent to (not X) ${op} Y; consider using X ${op === "==" ? "~=" : "=="} Y, or add parentheses to silence`
        : `not X ${op} Y is equivalent to (not X) ${op} Y; add parentheses to silence`,
    ]);
  });

  test.each(OPS)("a chain beginning with %s", (left) => {
    expect(inFunction(OPS.map((right) => ` print(a ${left} b ${right} c)`).join("\n"))).toEqual(
      OPS.map((right) =>
        equality(left) || equality(right)
          ? `X ${left} Y ${right} Z is equivalent to (X ${left} Y) ${right} Z; add parentheses to silence`
          : `X ${left} Y ${right} Z is equivalent to (X ${left} Y) ${right} Z; did you mean X ${left} Y and Y ${right} Z?`,
      ),
    );
  });

  test("parentheses on either side silence a chain", () => {
    expect(inFunction(" print((a < b) < c)\n print(a < (b < c))")).toEqual([]);
  });

  test("a longer chain warns at each comparison whose left side is one", () => {
    expect(covered("& run()\nfunction run(a, b, c, d)\n print(a < b < c < d)\nend\n")).toEqual([
      { code: "ComparisonPrecedence", text: "a < b < c" },
      { code: "ComparisonPrecedence", text: "a < b < c < d" },
    ]);
  });
});

describe("MisleadingAndOr", () => {
  test("only a literal false or nil as the middle operand warns", () => {
    expect(inFunction(" print(a and false or b)\n print(a and nil or b)\n print(a and true or b)\n print(a and 0 or b)\n print(a and '' or b)\n print(a and b or c)")).toEqual([
      "The and-or expression always evaluates to the second alternative because the first alternative is false; consider using if-then-else expression instead",
      "The and-or expression always evaluates to the second alternative because the first alternative is nil; consider using if-then-else expression instead",
    ]);
  });

  test("parentheses around the and, or around the literal, silence it, as in Luau", () => {
    expect(inFunction(" print((a and false) or b)\n print(a and (false) or b)\n print(a and (nil) or b)")).toEqual([]);
  });

  test("an if-expression and a lone and or or report nothing", () => {
    expect(inFunction(" print(if a then false else b)\n print(a and false)\n print(a or nil)\n print(false or b)")).toEqual([]);
  });

  test("the and that ends the left side is the one read", () => {
    // `a and b and false or c` is `((a and b) and false) or c`.
    expect(inFunction(" print(a and b and false or c)\n print(a and false and b or c)")).toEqual([
      "The and-or expression always evaluates to the second alternative because the first alternative is false; consider using if-then-else expression instead",
    ]);
  });
});

describe("both rules", () => {
  test("warn over the whole expression as Warnings", () => {
    const found = lints("& run()\nfunction run(a, b)\n  local _ = not a == b\n  local _ = a and nil or b\nend\n");
    expect(found.map((d) => ({ code: d.code, severity: d.severity, range: d.range }))).toEqual([
      { code: "ComparisonPrecedence", severity: 2, range: { start: { line: 2, character: 12 }, end: { line: 2, character: 22 } } },
      { code: "MisleadingAndOr", severity: 2, range: { start: { line: 3, character: 12 }, end: { line: 3, character: 26 } } },
    ]);
  });

  test("an expression nested in another is read", () => {
    expect(covered("& run()\nfunction run(a, b, c)\n print(tostring(not a == b) .. (a and nil or c))\nend\n")).toEqual([
      { code: "ComparisonPrecedence", text: "not a == b" },
      { code: "MisleadingAndOr", text: "a and nil or c" },
    ]);
  });

  test("code written in a type is left alone, as in Luau", () => {
    expect(inFunction(" type T = typeof(function() return not a == b, a and nil or b, a < b < c end)\n local _x: T")).toEqual([]);
  });

  test("an expression holding a syntax error is left alone", () => {
    expect(inFunction(" print(not a == b + )\n print(a and false or )\n print(a < b < )")).toEqual([]);
  });

  test("reads Luau outside functions", () => {
    expect(covered("store a = true\nstore b = false\n& a = not a == b\n& b = a and false or b\nHi {a < b < 1}.\n")).toEqual([
      { code: "ComparisonPrecedence", text: "not a == b" },
      { code: "MisleadingAndOr", text: "a and false or b" },
      { code: "ComparisonPrecedence", text: "a < b < 1" },
    ]);
  });

  test("reads a narrative if block's condition", () => {
    expect(covered("store a = true\nstore b = false\nif not a == b then\n  & a = b\nend\n")).toEqual([{ code: "ComparisonPrecedence", text: "not a == b" }]);
  });
});
