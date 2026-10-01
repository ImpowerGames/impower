// A declaration or reassignment list continued after a comma that ends its
// line keeps the comma and its value, and the continued lines indent one
// level past the statement, as stylua does.

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

  test.each([
    ["end", ["function f()", "  local a, g = 1,", "end", ""]],
    [
      "else",
      ["function f(ok)", "  if ok then", "    local a, g = 1,", "  else", "    return 2", "  end", "end", ""],
    ],
    ["prose after a narrative declaration", ["store hp = 100,", "", "The hero has {hp} health.", ""]],
  ])("leaves the line after a comma with no value alone: %s", (_name, lines) => {
    const source = lines.join("\n");
    expect(formatSource(source)).toBe(source);
  });

  test.each([
    ["a table", ["  local a, t = 1,", "    {", "      k = 5,", "    }"]],
    ["a function", ["  local a, f = 1,", "    function ()", "      return 7", "    end"]],
    ["a call", ["  local a, m = 1,", "    math.max(", "      2,", "      5", "    )"]],
  ])("keeps the body of %s started on a continued line one level deeper", (_name, lines) => {
    const source = ["function f()", ...lines, "  return a", "end", ""].join("\n");
    expect(formatSource(source)).toBe(source);
  });

  test("indents an unindented if expression after the comma one level past the declaration", () => {
    const source = [
      "function f(c)",
      "  local a, g = 1,",
      "if c",
      "then 2",
      "else 3",
      "  g = g + 1",
      "  return g",
      "end",
      "",
    ].join("\n");
    expect(formatSource(source)).toBe(
      [
        "function f(c)",
        "  local a, g = 1,",
        "    if c",
        "    then 2",
        "    else 3",
        "  g = g + 1",
        "  return g",
        "end",
        "",
      ].join("\n"),
    );
  });

  test("leaves the line after a complete declaration at the declaration's level", () => {
    const source = ["function f()", "  local a = 1", "  a = 2", "end", ""].join("\n");
    expect(formatSource(source)).toBe(source);
  });
});

describe("formatting a reassignment list continued after a trailing comma", () => {
  test("leaves a well-indented continuation as written", () => {
    const source = [
      "function f()",
      "  local a, g = 0, 0",
      "  a, g = 1,",
      "    2",
      "  return g",
      "end",
      "",
    ].join("\n");
    expect(formatSource(source)).toBe(source);
  });

  test("indents the value and comment lines one level past the reassignment", () => {
    const source = [
      "function f()",
      "  local a, g, h = 0, 0, 0",
      "  a, g, h = 1, -- first",
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
        "  local a, g, h = 0, 0, 0",
        "  a, g, h = 1, -- first",
        "    -- second",
        "    2,",
        "    3",
        "  return g",
        "end",
        "",
      ].join("\n"),
    );
  });

  test("leaves the line after a comma with no value alone", () => {
    const source = ["function f()", "  local a, g = 0, 0", "  a, g = 1,", "end", ""].join("\n");
    expect(formatSource(source)).toBe(source);
  });

  test("indents a target list continued after a trailing comma one level past the reassignment", () => {
    const source = ["function f()", "  local a, g = 0, 0", "  a,", "g = 1, 2", "  return g", "end", ""].join("\n");
    expect(formatSource(source)).toBe(
      ["function f()", "  local a, g = 0, 0", "  a,", "    g = 1, 2", "  return g", "end", ""].join("\n"),
    );
  });

  test.each([
    ["a reassignment", "  a, g = 1,"],
    ["a declaration", "  local b, c = 1,"],
  ])("keeps a negative value on the continued line of %s unary", (_name, line) => {
    const source = ["function f()", "  local a, g = 0, 0", line, "    -2", "  return g", "end", ""].join("\n");
    expect(formatSource(source)).toBe(source);
  });
});
