// Ported from Luau's parser tests for malformed function definitions and
// calls (`luau/tests/Parser.test.cpp`). Snippets and expected messages are
// quoted verbatim; the upstream test-case name is in the comment above each
// group. Each skip states the divergence it stands for.

import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

// Luau: parse_error_function_call
// "Expected '(', '{' or <string> when parsing function call, got '2'"
describe.skip("method call with a bare argument (diverges: accepted silently)", () => {
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
// "Expected function call arguments after '('"
describe.skip("method call with no argument list (diverges: accepted silently)", () => {
  test("t:Parse then newline", () => {
    const msgs = diagnoseInFunction(
      "function stringifyTable(t)\n    local foo = t:Parse\n    return foo\nend",
    );
    expect(msgs).toContain("Expected function call arguments after '('");
  });
});

// Luau: parse_error_varargs
// "Cannot use '...' outside of a vararg function"
//
// `...` lowers to a read of the function's hidden varargs variable. In a
// function with no `...` parameter that variable does not exist, and what
// surfaces is a warning naming the internal `__varargs__` rather than an
// error naming the rule.
describe.skip("varargs outside a vararg function (diverges: warns about the internal variable)", () => {
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
// `...` has to be the final parameter; in a type position the list is
// closed by `)`.
describe.skip("variadic not last (diverges: accepted silently; the type cases are N/A)", () => {
  test("function foo(..., a) end", () => {
    expect(diagnoseInFunction("function foo(..., a) end")).toContain(
      "Expected ')' (to close '(' at column 13), got ','",
    );
  });

  // Type annotations are parsed but ignored (DIVERGENCES.md).
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

// Luau: extra_token_in_consume / extra_token_in_consume_match are the
// function-header cases of the same recovery; they live in
// StatementErrors.test.ts with the other unexpected-token cases.
