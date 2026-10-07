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

  // The reassignment ends at the start of an unindented line (#1494), and
  // the line it continues onto is still one of its continued lines.
  test("indents an unindented value after a trailing comma one level past the reassignment", () => {
    const source = ["function f()", "  local a, g = 0, 0", "  a, g = 1,", "tostring(2)", "  return g", "end", ""].join("\n");
    expect(formatSource(source)).toBe(
      ["function f()", "  local a, g = 0, 0", "  a, g = 1,", "    tostring(2)", "  return g", "end", ""].join("\n"),
    );
  });

  test.each([
    ["each value of a list over several lines", ["  a, g, h = 1,", "2,", "3"], ["  a, g, h = 1,", "    2,", "    3"]],
    ["an anonymous function value and its body", ["  a, g = 1,", "function ()", "return 2", "end"], ["  a, g = 1,", "    function ()", "      return 2", "    end"]],
    ["a call over several lines and the value after it", ["  a, g, h = 1,", "math.max(", "2,", "3", "),", "4"], ["  a, g, h = 1,", "    math.max(", "      2,", "      3", "    ),", "    4"]],
  ])("indents %s at column 0 after a trailing comma one level past the reassignment", (_name, lines, formatted) => {
    const wrap = (body: string[]) => ["function f()", "  local a, g, h = 0, 0, 0", ...body, "  return g", "end", ""].join("\n");
    expect(formatSource(wrap(lines))).toBe(wrap(formatted));
    expect(formatSource(wrap(formatted))).toBe(wrap(formatted));
  });

  // A block comment that spans lines ends the line the list's last value
  // is on, so the call after it is a statement of its own (`2` ends the
  // list). The comment's own lines are left aside: the formatter rewrites
  // the space after its close on a second pass, as it does on main.
  test("leaves a call after a value and a comment spanning lines at the statement's level", () => {
    const source = ["function f()", "  local a, g = 0, 0", "  a, g = 1,", "2 --[[comment", "]] math.max(", "3,", "4", ")", "  return g", "end", ""].join("\n");
    const callLines = (text: string) => text.split("\n").filter((line) => /^\s*(3,|4|\))$/.test(line));
    const once = formatSource(source);
    expect(callLines(once)).toEqual(["    3,", "    4", "  )"]);
    expect(callLines(formatSource(once))).toEqual(callLines(once));
  });

  // The reassignment ends at an unindented line, so which of the lines after
  // it hold the rest of its list is decided as it reads them once indented
  // (#1494, round 4): a call split by a comment that spans lines, a comment
  // before the comma, a call after a finished value on the same line, and a
  // named function that is a statement of its own.
  test.each([
    [
      "a call whose callee and arguments a comment spanning lines splits",
      ["  a, g = 1,", "tostring --[[note", "]] (", "2", ")"],
      ["  a, g = 1,", "    tostring --[[note", "    ]] (", "      2", "    )"],
    ],
    [
      "a value followed by a comment spanning lines and its comma",
      ["  a, g, h = 1,", "2 --[[note", "]],", "math.max(", "3,", "4", ")"],
      ["  a, g, h = 1,", "    2 --[[note", "    ]],", "    math.max(", "      3,", "      4", "    )"],
    ],
    [
      "a call after the last value on its line",
      ["  a, g = 1,", "2 --[[note]] math.max(", "3,", "4", ")"],
      ["  a, g = 1,", "    2 --[[note]] math.max(", "    3,", "    4", "  )"],
    ],
    [
      "a dotted function declaration",
      ["  a, g = 1,", "function obj.named()", "return 2", "end"],
      ["  a, g = 1,", "  function obj.named()", "    return 2", "  end"],
    ],
    [
      "a method declaration",
      ["  a, g = 1,", "function obj:named()", "return 2", "end"],
      ["  a, g = 1,", "  function obj:named()", "    return 2", "  end"],
    ],
  ])("formats %s after a trailing comma at column 0 as it reads once indented", (_name, lines, formatted) => {
    const wrap = (body: string[]) => ["function f()", "  local a, g, h = 0, 0, 0", ...body, "  return g", "end", ""].join("\n");
    expect(formatSource(wrap(lines))).toBe(wrap(formatted));
    expect(formatSource(wrap(formatted))).toBe(wrap(formatted));
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
