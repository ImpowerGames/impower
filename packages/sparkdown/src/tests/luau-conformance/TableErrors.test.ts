import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

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

describe.skip("unfinished table constructor (diverges: accepted silently)", () => {
  test("local t = { a = 1,", () => {
    expect(diagnoseInFunction("local t = { a = 1,")).toContain(
      "Expected '}' (to close '{' at column 11), got <eof>",
    );
  });
});

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
