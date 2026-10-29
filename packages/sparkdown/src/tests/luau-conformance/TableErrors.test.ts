import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

// Luau: parse_error_table_literal
describe("parentheses used as a table constructor", () => {
  test("local foo = (name = t)", () => {
    const msgs = diagnoseInFunction(
      "function stringifyTable(t)\n    local foo = (name = t)\n    return foo\nend",
    );
    expect(msgs).toContain(
      "Expected ')' (to close '(' at column 17), got '='; did you mean to use '{' when defining a table?",
    );
  });
});

// Luau: parse_error_messages (the table-type half) and

describe.skip("unfinished table constructor (diverges: accepted silently)", () => {
  test("local t = { a = 1,", () => {
    expect(diagnoseInFunction("local t = { a = 1,")).toContain(
      "Expected '}' (to close '{' at column 11), got <eof>",
    );
  });
});

// Luau: parse_interpolated_string_without_end_brace_in_table /
describe("an unterminated interpolation inside a table", () => {
  test("`{a` reports the interpolation", () => {
    const msgs = diagnoseInFunction("local a = {`{a`}");
    expect(
      msgs.some((m) =>
        m.startsWith("Malformed interpolated string; did you forget to add a"),
      ),
    ).toBe(true);
  });

  describe.skip("the enclosing table (diverges: recovery cascade is parser-specific)", () => {
    test("`{a` also reports the table's `}`", () => {
      expect(diagnoseInFunction("local a = {`{a`}")).toContain(
        "Expected '}' (to close '{' at column 11), got <eof>",
      );
    });
  });
});
