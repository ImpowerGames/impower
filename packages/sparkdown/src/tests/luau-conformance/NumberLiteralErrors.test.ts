// Ported from Luau's parser tests for numeric literals
// (`luau/tests/Parser.test.cpp`). Snippets and expected messages are quoted
// verbatim; the upstream test-case name is in the comment above each group.
//
// Luau's lexer takes every letter, digit, `_` and `.` after a number into one
// token and rejects it when it does not convert. The grammar here stops the
// number at the first character it cannot use, so `123x` used to parse as
// `123` followed by narrative text and `0b123` as `0b1` then `23`, both
// silently. The validator now reports the same "Malformed number".

import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

// Luau: parse_numbers_error
describe("malformed numbers", () => {
  const expected = "Malformed number";

  test.each([
    ["return 0b123", "return 0b123"],
    ["return 0b0b1", "return 0b0b1"],
    ["return 123x", "return 123x"],
    ["return 0xg", "return 0xg"],
    ["return 0x0x123", "return 0x0x123"],
    [
      "return 0xffffffffffffffffffffllllllg",
      "return 0xffffffffffffffffffffllllllg",
    ],
    [
      "return 0x0xffffffffffffffffffffffffffff",
      "return 0x0xffffffffffffffffffffffffffff",
    ],
  ])("%s", (_label, source) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });

  // Luau reads `1..2` as one number token (`.` is a number character), so a
  // concatenation needs whitespace around `..`.
  test("a number running into `..` is malformed", () => {
    expect(diagnoseInFunction("return 1..2")).toContain(expected);
    expect(diagnoseInFunction("return 1 .. 2")).toEqual([]);
  });
});

// Luau: number_literals
describe("well-formed numbers are not flagged", () => {
  test.each([
    ["1", "return 1"],
    ["1.5", "return 1.5"],
    [".5", "return .5"],
    ["12_34_56", "return 12_34_56"],
    ["0x1234", "return 0x1234"],
    ["0b010101", "return 0b010101"],
    ["1e10", "return 1e10"],
    ["1.5e-3", "return 1.5e-3"],
    ["number then operator", "return 1+2"],
    ["number then method call", "return (1):type()"],
  ])("%s", (_label, source) => {
    expect(diagnoseInFunction(source)).toEqual([]);
  });
});

// Luau: parse_numbers_error (the `LuauIntegerType2` half)
// "Malformed integer" / "Integer overflow"
//
// N/A: sparkdown has no integer literal type, so the `i` suffix is not a
// number character at all. `123ii` and the rest are reported as
// "Malformed number" like any other letter after a number, and an integer
// cannot overflow.
describe.skip("integer literals (N/A: no integer literal type)", () => {
  test.each([
    ["return 0x0xABCi", "Malformed integer"],
    ["return 0xABCMi", "Malformed integer"],
    ["return 0b250i", "Malformed integer"],
    ["return 0bbbbi", "Malformed integer"],
    ["return 0b0b1i", "Malformed integer"],
    ["return 123ii", "Malformed integer"],
    ["return 0xABii", "Malformed integer"],
    ["return 99999999999999999999i", "Integer overflow"],
    ["return 0xFFFFFFFFFFFFFFFFFFi", "Integer overflow"],
    [
      "return 0b10000000000000000000000000000000000000000000000000000000000000000i",
      "Integer overflow",
    ],
  ])("%s", (source, expected) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });
});
