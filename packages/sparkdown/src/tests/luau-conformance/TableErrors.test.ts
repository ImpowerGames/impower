// Ported from Luau's parser tests for malformed table constructors
// (`luau/tests/Parser.test.cpp`). Snippets and expected messages are quoted
// verbatim; the upstream test-case name is in the comment above each group.
// Each skip states the divergence it stands for.

import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

// Luau: parse_error_table_literal
// A `(name = t)` where `{name = t}` was meant.
describe.skip("parentheses used as a table constructor (diverges: accepted silently)", () => {
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
// extra_table_indexer_recovery are about TABLE TYPES, not constructors;
// they live in TypeAnnotationErrors.test.ts.

describe.skip("unfinished table constructor (diverges: accepted silently)", () => {
  // Luau reports the unclosed `{` the same way it reports any unclosed
  // bracket; the wording is the generic `consumeMatch` one.
  test("local t = { a = 1,", () => {
    expect(diagnoseInFunction("local t = { a = 1,")).toContain(
      "Expected '}' (to close '{' at column 11), got <eof>",
    );
  });
});

// Luau: parse_interpolated_string_without_end_brace_in_table /
// _mid_without_end_brace_in_table
// An unterminated interpolation inside a constructor also reports the
// enclosing table's missing `}`.
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
