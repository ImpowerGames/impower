// A declaration list continued after a comma that ends its line keeps the
// comma and its value, and the continued lines indent one level past the
// declaration, as stylua does.

import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a declaration list continued after a trailing comma", () => {
  test("leaves a well-indented continuation as written", () => {
    const source = [
      "function f()",
      "  local a, g = 1,",
      "    2",
      "  return g",
      "end",
      "",
    ].join("\n");
    expect(formatSource(source)).toBe(source);
  });

  test("indents the value and comment lines one level past the declaration", () => {
    const source = [
      "function f()",
      "  local a, g, h = 1, -- first",
      "-- second",
      "        2,",
      "  3",
      "  return g",
      "end",
      "",
    ].join("\n");
    expect(formatSource(source)).toBe(
      [
        "function f()",
        "  local a, g, h = 1, -- first",
        "    -- second",
        "    2,",
        "    3",
        "  return g",
        "end",
        "",
      ].join("\n"),
    );
  });

  test("indents a top-level store continuation", () => {
    expect(formatSource("store a, b = 1,\n2\n")).toBe("store a, b = 1,\n  2\n");
  });

  test("leaves the line after a complete declaration at the declaration's level", () => {
    const source = ["function f()", "  local a = 1", "  a = 2", "end", ""].join("\n");
    expect(formatSource(source)).toBe(source);
  });
});
