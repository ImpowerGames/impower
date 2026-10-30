import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

// Luau: parse_error_function_call
describe("method call with a bare argument", () => {
  test("t:Parse 2", () => {
    const msgs = diagnoseInFunction(
      "function stringifyTable(t)\n    local foo = t:Parse 2\n    return foo\nend",
    );
    expect(msgs).toContain(
      "Expected '(', '{' or <string> when parsing function call, got '2'",
    );
  });
});

// Luau: parse_error_function_call_newline
describe("method call with no argument list", () => {
  test("t:Parse then newline", () => {
    const msgs = diagnoseInFunction(
      "function stringifyTable(t)\n    local foo = t:Parse\n    return foo\nend",
    );
    expect(msgs).toContain("Expected function call arguments after '('");
  });
});

// Luau: parse_error_varargs
describe("varargs outside a vararg function", () => {
  test("function add(x, y) return ... end", () => {
    expect(
      diagnoseInFunction("function add(x, y) return ... end"),
    ).toContain("Cannot use '...' outside of a vararg function");
  });
});

describe("varargs inside a vararg function are well-formed", () => {
  test("function add(...) return ... end", () => {
    expect(diagnoseInFunction("function add(...) return ... end")).toEqual([]);
  });
});

// Luau: variadics_must_be_last
describe("variadic not last (the type cases are N/A)", () => {
  test("function foo(..., a) end", () => {
    expect(diagnoseInFunction("function foo(..., a) end")).toContain(
      "Expected ')' (to close '(' at column 13), got ','",
    );
  });

  test.each([
    [
      "function foo(): (...number, string) end",
      "Expected ')' (to close '(' at column 17), got ','",
    ],
    [
      "type Foo = (...number, string) -> (...string, number)",
      "Expected ')' (to close '(' at column 12), got ','",
    ],
  ])("%s", (source, expected) => {
    expect(diagnoseInFunction(source)).toContain(expected);
  });
});
