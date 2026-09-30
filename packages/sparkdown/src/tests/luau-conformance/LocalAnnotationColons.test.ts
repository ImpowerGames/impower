import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { collectDiagnostics } from "../runtime/runtimeTestHarness";

// Colons around a declaration's targets that Luau rejects: a `::` after a
// target on a line continued from a trailing comma (#1166), a `:` or `::`
// with no name before it (#1167), and an annotation written with two
// separate colons (#1168). The editor reports Luau's first error, with its
// wording and range.

type Fields = [number, number, number, number, string];

// Compared without the code, so the expected text holds no error name.
const fields = (d: { line: number; column: number; endLine: number; endColumn: number; message: string }): Fields => [
  d.line,
  d.column,
  d.endLine,
  d.endColumn,
  d.message,
];

function expectLuausFirstError(source: string) {
  const { syntaxDiagnostics, diagnostics } = checkLuau(source);
  expect(diagnostics.length).toBeGreaterThan(0);
  expect(syntaxDiagnostics.map(fields)).toEqual([fields(diagnostics[0]!)]);
}

describe("a `::` after a target on a continued line (#1166)", () => {
  test.each([
    "local a,\n  b :: number",
    "local a,\n  b::number",
    "local a, -- note\n  b :: number",
    "local a,\n  b,\n  c :: number",
    "local a: number,\n  b :: number",
    "function f()\n  local a,\n    b :: number\nend",
  ])("%j reports the `::` as Luau does", (statement) => {
    expectLuausFirstError(`${statement}\n`);
  });

  test("the error is on the `::`", () => {
    expect(checkLuau("local a,\n  b :: number\n").syntaxDiagnostics.map(fields)).toEqual([
      [1, 4, 1, 6, "Expected identifier when parsing expression, got '::'"],
    ]);
  });
});

describe("a `:` or `::` with no name before it (#1167)", () => {
  test.each([
    "local :: number",
    "local::number",
    "local : number",
    "local :: number = 1",
    "local a, :: number",
    "local a, : number",
    "local a,\n  :: number",
  ])("%j reports the colon as Luau does", (statement) => {
    expectLuausFirstError(`${statement}\n`);
  });

  test.each([
    ["local :: number", [0, 6, 0, 8, "Expected identifier when parsing variable name, got '::'"]],
    ["local : number", [0, 6, 0, 7, "Expected identifier when parsing variable name, got ':'"]],
    // Sparkdown's own modifiers, which Luau does not know, read the same way.
    ["const :: number", [0, 6, 0, 8, "Expected identifier when parsing variable name, got '::'"]],
    ["store : number", [0, 6, 0, 7, "Expected identifier when parsing variable name, got ':'"]],
  ] as [string, Fields][])("%j is worded as Luau words it", (statement, expected) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(fields)).toEqual([expected]);
  });
});

describe("an annotation written with two separate colons (#1168)", () => {
  test.each([
    "local c : : number",
    "local c: : number",
    "local c:  : number",
    "local c: : number = 1",
    "local a, c: : number",
    "function f(a: : number) end",
  ])("%j reports the second colon as Luau does", (statement) => {
    expectLuausFirstError(`${statement}\n`);
  });

  test("the error runs from the first colon to the end of the second", () => {
    expect(checkLuau("local c : : number\n").syntaxDiagnostics.map(fields)).toEqual([
      [0, 9, 0, 11, "Expected type, got ':'"],
    ]);
  });
});

// `checkLuau` compiles its snippet as a function body. In a narrative body
// (a script's top level or a scene) the declaration ends at its line, so
// these check every error the compiled script reports there.
describe("in a narrative body", () => {
  test.each([
    ["local :: number", "Expected identifier when parsing variable name, got '::'"],
    ["local : number", "Expected identifier when parsing variable name, got ':'"],
    ["local a, :: number", "Expected identifier when parsing variable name, got '::'"],
    ["store : number", "Expected identifier when parsing variable name, got ':'"],
    ["local c : : number", "Expected type, got ':'"],
    ["local c: : number = 1", "Expected type, got ':'"],
    ["scene S\n  local :: number\nend", "Expected identifier when parsing variable name, got '::'"],
    ["scene S\n  local c : : number\nend", "Expected type, got ':'"],
    // A function in the script is Luau code, where the comma continues the list.
    ["function f()\n  local a,\n    b :: number\nend", "Expected identifier when parsing expression, got '::'"],
  ])("%j reports the one error", (source, message) => {
    expect(collectDiagnostics(`${source}\n`).errorMessages).toEqual([message]);
  });

  // The next line is story, so a trailing comma is the only error, as it is
  // before a target with a valid annotation (`TrailingCommaValueList`).
  test.each(["local a,\nb :: number", "local a,\nb: number", "scene S\n  local a,\n  b :: number\nend"])(
    "%j reports only the trailing comma",
    (source) => {
      expect(collectDiagnostics(`${source}\n`).errorMessages).toEqual([
        "Expected identifier when parsing binding name, got 'b'",
      ]);
    },
  );

  test.each(["local x: number", "local x: {a: number}", "local f: (a: number) -> ()", "local x = 1\nlocal y = x :: number"])(
    "%j stays free of errors",
    (source) => {
      expect(collectDiagnostics(`${source}\n`).errorMessages).toEqual([]);
    },
  );
});

describe("colons Luau accepts stay free of syntax errors", () => {
  test.each([
    "local x: number",
    "local x: number = 1",
    "local x: {a: number}",
    "local f: (a: number) -> ()",
    "local f: (a: number) -> () = function(a) end",
    "local a,\n  b: number",
    "local a,\n  b",
    "local a, b = 1,\n  x :: number",
    "local a,\n  b = 1,\n  x :: number",
    "local a, b: number = 1,\n  x :: number",
    "local y = x :: number",
    "local function f() end",
    "local t = {m = function(self) return 1 end}\nlocal y = t:m()",
  ])("%j", (statement) => {
    expect(checkLuau(`local x = 1\n${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});
