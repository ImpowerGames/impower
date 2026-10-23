import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic, inDiagnosticOrder, luauSyntaxErrors } from "./typecheckTestHarness";
import { collectDiagnostics } from "../runtime/runtimeTestHarness";

// Colons around a declaration's targets that Luau rejects: a `::` after a
// target on a line continued from a trailing comma (#1166), a `:` or `::`
// with no name before it (#1167), and an annotation written with two
// separate colons (#1168). The editor reports Luau's errors, the first and
// those of Luau's recovery after it (I-1322), with their wording and range.

type Fields = [number, number, number, number, string];

// Compared without the code, so the expected text holds no error name.
const fields = (d: { line: number; column: number; endLine: number; endColumn: number; message: string }): Fields => [
  d.line,
  d.column,
  d.endLine,
  d.endColumn,
  d.message,
];

function expectLuausErrors(source: string) {
  const { syntaxDiagnostics, diagnostics } = checkLuau(source);
  expect(diagnostics.length).toBeGreaterThan(0);
  expect(syntaxDiagnostics.map(fields)).toContainEqual(fields(diagnostics[0]!));
  expect(inDiagnosticOrder(syntaxDiagnostics)).toEqual(luauSyntaxErrors(diagnostics));
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
    expectLuausErrors(`${statement}\n`);
  });

  test("the error is on the `::`", () => {
    expect(checkLuau("local a,\n  b :: number\n").syntaxDiagnostics.map(fields)).toEqual(expect.arrayContaining([
      [1, 4, 1, 6, "Expected identifier when parsing expression, got '::'"],
    ]));
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
    expectLuausErrors(`${statement}\n`);
  });

  test.each([
    ["local :: number", [0, 6, 0, 8, "Expected identifier when parsing variable name, got '::'"]],
    ["local : number", [0, 6, 0, 7, "Expected identifier when parsing variable name, got ':'"]],
    // `const` reads the same way.
    ["const :: number", [0, 6, 0, 8, "Expected identifier when parsing variable name, got '::'"]],
  ] as [string, Fields][])("%j is worded as Luau words it", (statement, expected) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(fields)).toContainEqual(expected);
  });

  // In Luau code `store` begins a declaration only before a name (#1328):
  // here it is a name, as Luau reads it, and the colon a method's. In a
  // narrative body it still begins one (below).
  test("\"store : number\" in Luau code reports what Luau reports", () => {
    expectLuausErrors("store : number\n");
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
    expectLuausErrors(`${statement}\n`);
  });

  test("the error runs from the first colon to the end of the second", () => {
    expect(checkLuau("local c : : number\n").syntaxDiagnostics.map(fields)).toEqual(expect.arrayContaining([
      [0, 9, 0, 11, "Expected type, got ':'"],
    ]));
  });
});

// `checkLuau` compiles its snippet as a function body. In a narrative body
// (a script's top level or a scene) the declaration ends at its line, so
// these check every error the compiled script reports there: Luau's, its
// recovery's included, as the statement's reading reports them (I-1515).
describe("in a narrative body", () => {
  test.each([
    ["local :: number", ["Expected identifier when parsing variable name, got '::'", "Incomplete statement: expected assignment or a function call"]],
    ["local : number", ["Expected identifier when parsing variable name, got ':'"]],
    ["local a, :: number", ["Expected identifier when parsing variable name, got '::'", "Incomplete statement: expected assignment or a function call"]],
    ["store : number", ["Expected identifier when parsing variable name, got ':'"]],
    [
      "local c: : number = 1",
      ["Expected type, got ':'", "Expected identifier when parsing expression, got ':'", "Expected '(', '{' or <string> when parsing function call, got '='"],
    ],
    ["scene S\n  local :: number\nend", ["Expected identifier when parsing variable name, got '::'", "Incomplete statement: expected assignment or a function call"]],
  ])("%j reports Luau's errors", (source, messages) => {
    expect(collectDiagnostics(`${source}\n`).errorMessages).toEqual(messages);
  });

  // Luau ends `local c : : number`'s method call at `number` with `Expected
  // function call arguments after '('`; the reading meets the line's end
  // there and words it as a call with no arguments at <eof> (TICKET-PENDING).
  test.each(["local c : : number", "scene S\n  local c : : number\nend"])("%j reports Luau's first two errors and the reading's third", (source) => {
    expect(collectDiagnostics(`${source}\n`).errorMessages).toEqual([
      "Expected type, got ':'",
      "Expected identifier when parsing expression, got ':'",
      "Expected '(', '{' or <string> when parsing function call, got <eof>",
    ]);
  });

  // A function in the script is Luau code, where the comma continues the
  // list, and every error of Luau's reading is reported (I-1322).
  test("in a function, the comma continues the list", () => {
    expect(collectDiagnostics("function f()\n  local a,\n    b :: number\nend\n").errorMessages).toEqual([
      "Expected identifier when parsing expression, got '::'",
      "Incomplete statement: expected assignment or a function call",
    ]);
  });

  // The next line is story, so a trailing comma is the only error, as it is
  // before a target with a valid annotation (`TrailingCommaValueList`). The
  // declaration's Luau meets its end of input at the line's end (#1907).
  test.each(["local a,\nb :: number", "local a,\nb: number", "scene S\n  local a,\n  b :: number\nend"])(
    "%j reports only the trailing comma",
    (source) => {
      expect(collectDiagnostics(`${source}\n`).errorMessages).toEqual([
        "Expected identifier when parsing variable name, got <eof>",
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
