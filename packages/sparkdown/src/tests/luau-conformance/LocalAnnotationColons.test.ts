import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic, inDiagnosticOrder, luauSyntaxErrors } from "./typecheckTestHarness";
import { collectDiagnostics } from "../runtime/runtimeTestHarness";

type Fields = [number, number, number, number, string];

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
    ["const :: number", [0, 6, 0, 8, "Expected identifier when parsing variable name, got '::'"]],
  ] as [string, Fields][])("%j is worded as Luau words it", (statement, expected) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(fields)).toContainEqual(expected);
  });

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

describe("in a narrative body", () => {
  test.each([
    ["scene S\n  local :: number\nend", ["Expected identifier when parsing variable name, got '::'", "Incomplete statement: expected assignment or a function call"]],
    ["scene S\n  local : number\nend", ["Expected identifier when parsing variable name, got ':'"]],
    ["scene S\n  local a, :: number\nend", ["Expected identifier when parsing variable name, got '::'", "Incomplete statement: expected assignment or a function call"]],
    ["store : number", ["Expected identifier when parsing variable name, got ':'"]],
    [
      "scene S\n  local c: : number = 1\nend",
      ["Expected type, got ':'", "Expected identifier when parsing expression, got ':'", "Expected '(', '{' or <string> when parsing function call, got '='"],
    ],
  ])("%j reports Luau's errors", (source, messages) => {
    expect(collectDiagnostics(`${source}\n`).errorMessages).toEqual(messages);
  });

  test.each(["scene S\n  local c : : number\nend"])("%j reports Luau's first two errors and the reading's third", (source) => {
    expect(collectDiagnostics(`${source}\n`).errorMessages).toEqual([
      "Expected type, got ':'",
      "Expected identifier when parsing expression, got ':'",
      "Expected '(', '{' or <string> when parsing function call, got <eof>",
    ]);
  });

  test("in a function, the comma continues the list", () => {
    expect(collectDiagnostics("function f()\n  local a,\n    b :: number\nend\n").errorMessages).toEqual([
      "Expected identifier when parsing expression, got '::'",
      "Incomplete statement: expected assignment or a function call",
    ]);
  });

  test.each(["scene S\n  local a,\n  b :: number\nend", "scene S\n  local a,\n  b: number\nend"])(
    "%j reports only the trailing comma",
    (source) => {
      expect(collectDiagnostics(`${source}\n`).errorMessages).toEqual([
        "Expected identifier when parsing variable name, got <eof>",
      ]);
    },
  );

  test.each([
    "scene S\n  local x: number\nend",
    "scene S\n  local x: {a: number}\nend",
    "scene S\n  local f: (a: number) -> ()\nend",
    "scene S\n  local x = 1\n  local y = x :: number\nend",
  ])(
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
