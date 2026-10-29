import { describe, expect, test } from "vitest";
import { diagnose, diagnoseInFunction } from "./diagnosticTestHarness";

describe.skip("function and table types (N/A: only a type that cannot begin is reported)", () => {
  test.each([
    [
      "local a: (number, number) -> (string",
      "Expected ')' (to close '(' at line 2), got <eof>",
    ],
    [
      "local a: (number, number) -> (\n    string",
      "Expected ')' (to close '(' at line 2), got <eof>",
    ],
    [
      "local a: (number, number)",
      "Expected '->' when parsing function type, got <eof>",
    ],
    [
      "local a: (number, number",
      "Expected ')' (to close '(' at line 2), got <eof>",
    ],
    [
      "local a: {foo: string,",
      "Expected identifier when parsing table field, got <eof>",
    ],
    [
      "local a: {foo: string",
      "Expected '}' (to close '{' at line 2), got <eof>",
    ],
    [
      "local a: { [string]: number, [number]: string }",
      "Cannot have more than one table indexer",
    ],
    [
      "type T = <a>foo",
      "Expected '(' when parsing function parameters, got 'foo'",
    ],
  ])("%s", (source, expected) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });
});

describe.skip("mixed union and intersection (N/A: only a type that cannot begin is reported)", () => {
  test("type A = number & string | boolean", () => {
    expect(
      diagnoseInFunction("type A = number & string | boolean"),
    ).toContain(
      "Mixing union and intersection types is not allowed; consider wrapping in parentheses.",
    );
  });
});

describe("a value where a type is expected", () => {
  test("local a : 2 = 2", () => {
    expect(diagnoseInFunction("local a : 2 = 2")).toContain(
      "Expected type, got '2'",
    );
  });

  test("local x:", () => {
    expect(diagnose("-> s\nscene s\n  local x:\nend\n")).toEqual(["Expected type, got <eof>"]);
  });
});

describe.skip("type alias headers (N/A: only a type that cannot begin is reported)", () => {
  test.each([
    ["type 5 = number", "Expected identifier when parsing type name, got '5'"],
    ["type A", "Expected '=' when parsing type alias, got <eof>"],
    ["type A<", "Expected identifier, got <eof>"],
    ["type A<B", "Expected '>' (to close '<' at column 7), got <eof>"],
  ])("%s", (source, expected) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });
});

describe.skip("unparenthesized return type list (N/A: only a type that cannot begin is reported)", () => {
  test.each([
    ["function foo(): string, number end"],
    ["function foo(): (number) -> string, string"],
  ])("%s", (source) => {
    expect(diagnoseInFunction(source)).toContain(
      "Expected a statement, got ','; did you forget to wrap the list of return types in parentheses?",
    );
  });
});

describe.skip("table type fields (N/A: only a type that cannot begin is reported)", () => {
  test.each([
    [
      "local n: {string, number}",
      "Expected '}' (to close '{' at column 10), got ','",
    ],
    [
      "local n: {[number]: string, number}",
      "Expected ':' when parsing table field, got '}'",
    ],
    [
      "local n: {x: string, number}",
      "Expected ':' when parsing table field, got '}'",
    ],
    [
      "local n: {x: string, nil}",
      "Expected identifier when parsing table field, got 'nil'",
    ],
    [
      "local n: {string | number: number}",
      "Expected '}' (to close '{' at column 10), got ':'",
    ],
    [
      "local n: {nil: number}",
      "Expected '}' (to close '{' at column 10), got ':'",
    ],
  ])("%s", (source, expected) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });
});

describe.skip("second table indexer (N/A: only a type that cannot begin is reported)", () => {
  test("local a : { [string] : number, [number] : string, count: number }", () => {
    expect(
      diagnoseInFunction(
        "local a : { [string] : number, [number] : string, count: number }",
      ),
    ).toHaveLength(1);
  });
});

describe("type annotations are skipped without complaint", () => {
  test.each([
    ["local a: number = 1"],
    ["local a: (number, number) -> string = nil"],
    ["local a: {foo: string} = {}"],
  ])("%s", (source) => {
    expect(diagnoseInFunction(source)).toEqual([]);
  });
});
