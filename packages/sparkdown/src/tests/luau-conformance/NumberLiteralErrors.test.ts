// Ported from Luau's parser tests for numeric literals
// (`luau/tests/Parser.test.cpp`). Snippets and expected messages are quoted
// verbatim; the upstream test-case name is in the comment above each group.
//
// Luau's lexer takes every letter, digit, `_` and `.` after a number into one
// token and rejects it when it does not convert. The grammar here stops the
// number at the first character it cannot use (`123x` is the number `123`
// followed by `x`, `0b123` is `0b1` followed by `23`), so the validator looks
// at what follows the number and reports the same "Malformed number".

import { describe, expect, test } from "vitest";
import {
  diagnose,
  diagnoseDetailed,
  diagnoseInFunction,
} from "./diagnosticTestHarness";

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

// Where the check applies outside a function body. A `define` or `config`
// field value is a Luau expression, so a unit-suffixed number there is
// malformed exactly as it would be in a statement; a `style` or `theme`
// value is not a Luau number at all, and the inline text command's control
// argument reuses the number rule without being Luau.
describe("number contexts", () => {
  test.each([
    ["define field", "define my_thing with\n  version = 1.0.0\nend\n"],
    ["define field with a unit", "define my_thing with\n  delay = 100ms\nend\n"],
    ["config field", "config my_config with\n  version = 1.0.0\nend\n"],
  ])("%s is a Luau expression", (_label, source) => {
    expect(diagnose(source)).toContain("Malformed number");
  });

  test.each([
    ["style field with a unit", "style my_style with\n  padding = 8px\nend\n"],
    ["theme field with a unit", "theme my_theme with\n  gap = 1rem\nend\n"],
    ["narrative text", "He ran 5k today, version 1.0.2, from 1..2.\n"],
    ["inline text command control", "Hello <1.5x:there> friend.\n"],
  ])("%s is not checked", (_label, source) => {
    expect(diagnose(source)).not.toContain("Malformed number");
  });

  test("the reported range covers the whole run after the number", () => {
    // Longer than any fixed read-ahead window.
    const run = "x".repeat(200);
    const found = diagnoseDetailed(`function run()\nreturn 123${run}\nend\n`).find(
      (d) => d.message === "Malformed number",
    );
    expect(found?.range).toEqual({
      start: { line: 1, character: 7 },
      end: { line: 1, character: 7 + 3 + run.length },
    });
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
