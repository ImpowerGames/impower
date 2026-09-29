// A `local` or `store` value list that ends its line with a comma. In Luau
// code (a function body or a Luau block) the list continues on the next line,
// as in Luau: a comma ends nothing, and a comment after the comma, or blank
// and comment-only lines before the next value, leave the list open. A line
// that starts with something that is not a value (`end`, `else`, `until`, a
// statement, a `scene` header) belongs to the enclosing block, and the comma
// before it is Luau's parse error. In a narrative body the declaration ends
// at its line: the next line is story, and a comma that ends the line is the
// same error.

import { describe, expect, test } from "vitest";
import { collectDiagnostics, makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  const errors = [...ctx.errorMessages];
  ctx.story.onError = (m: string) => errors.push(m);
  const text = ctx.story.Continue();
  return { errors, warnings: ctx.warningMessages, text };
}

const local = (declaration: string, body: string) =>
  `Value {f()}.\nfunction f()\n${declaration}\n  ${body}\nend\n`;

describe("Luau code: a declaration list continues after a trailing comma", () => {
  test.each([
    ["next line", "  local a, g = 1,\n    2", "return g", "Value 2.\n"],
    ["after a comment", "  local a, g = 1, -- note\n    2", "return g", "Value 2.\n"],
    ["earlier slot untouched", "  local a, g = 1,\n    2", "return a", "Value 1.\n"],
    [
      "three lines",
      "  local a, g, b = 1,\n    2,\n    3",
      "return a + g * 10 + b * 100",
      "Value 321.\n",
    ],
    [
      "blank and comment lines between",
      "  local a, g = 1,\n\n    -- the second value\n    2",
      "return g",
      "Value 2.\n",
    ],
    ["call on the next line", "  local a, g = 1,\n    math.max(2, 5)", "return g", "Value 5.\n"],
    [
      "a variable on the next line",
      "  local b = 4\n  local a, g = 1,\n    b",
      "return g",
      "Value 4.\n",
    ],
    [
      "an anonymous function on the next line",
      "  local a, g = 1,\n    function() return 7 end",
      "return g()",
      "Value 7.\n",
    ],
    [
      "an if expression on the next line",
      "  local b = 1\n  local a, g = 1,\n    if b == 1 then 8 else 9",
      "return g",
      "Value 8.\n",
    ],
    [
      "a variable value on the same line",
      "  local b = 4\n  local a, g = 1, b",
      "return g",
      "Value 4.\n",
    ],
    [
      "a method call on the next line",
      '  local s = "abc"\n  local a, g = 1,\n    s:upper()',
      "return g",
      "Value ABC.\n",
    ],
    [
      "a method call on the same line",
      '  local s = "abc"\n  local a, g = 1, s:upper()',
      "return g",
      "Value ABC.\n",
    ],
    [
      "a comparison on the next line and on the same line",
      "  local b = 1\n  local a, g = 1,\n    b == 1\n  local c, h = 1, b == 2",
      "return tostring(g) .. tostring(h)",
      "Value truefalse.\n",
    ],
    [
      "a cast on the next line and on the same line",
      "  local b = 4\n  local a, g = 1,\n    b :: number\n  local c, h = 1, b :: number",
      "return g + h",
      "Value 8.\n",
    ],
    [
      "a name continued by an operator line",
      "  local n = 3\n  local a, g, c = 1,\n    n\n    + 4,\n    5",
      "return g * 10 + c",
      "Value 75.\n",
    ],
    [
      "a name on the comma's line continued by an operator line",
      "  local n = 3\n  local a, g = 1, n\n    + 4",
      "return g",
      "Value 7.\n",
    ],
    [
      "a name continued by a member line",
      "  local t = { x = 5 }\n  local a, g = 1,\n    t\n    .x",
      "return g",
      "Value 5.\n",
    ],
    [
      "literals on the next line and on the same line",
      "  local a, t, f, n = 1,\n    true, false,\n    nil\n  local b, u = 2, true",
      "return tostring(t) .. tostring(f) .. tostring(n) .. tostring(u)",
      "Value truefalseniltrue.\n",
    ],
    [
      "targets continued too",
      "  local a,\n    g = 1, 2",
      "return a + g * 10",
      "Value 21.\n",
    ],
    [
      "a statement after a complete declaration on the same line",
      "  local a = 5 return a",
      "",
      "Value 5.\n",
    ],
  ])("local: %s", (_name, declaration, body, expected) => {
    const { errors, text } = run(local(declaration, body));
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  test.each([
    ["on the same line", "function f(...)\n  local a, b = 0, ...\n  return b\nend\n"],
    ["on the next line", "function f(...)\n  local a, b = 0,\n    ...\n  return b\nend\n"],
  ])("a vararg value %s", (_name, fn) => {
    const { errors, text } = run(`Value {f(7, 8)}.\n${fn}`);
    expect(errors).toEqual([]);
    expect(text).toBe("Value 7.\n");
  });

  test("a statement after a complete list stays its own statement", () => {
    const { errors, text } = run(local("  local a, g = 1, 2\n  g = 3", "return g"));
    expect(errors).toEqual([]);
    expect(text).toBe("Value 3.\n");
  });
});

// Luau's parse error for the missing value, reported on the comma's line.
const missingValue = (got: string) =>
  `Expected identifier when parsing expression, got '${got}'`;

describe("Luau code: a comma with nothing after it", () => {
  test.each([
    ["end", "function f()\n  local a, g = 1,\nend\nfunction h()\n  return 7\nend\nAlso {h()}.\n", "end"],
    [
      "else",
      "function f(ok)\n  if ok then\n    local a, g = 1,\n  else\n    return 2\n  end\nend\nValue {f(false)}.\n",
      "else",
    ],
    [
      "elseif",
      "function f(ok)\n  if ok then\n    local a, g = 1,\n  elseif not ok then\n    return 2\n  end\nend\nValue {f(false)}.\n",
      "elseif",
    ],
    [
      "until",
      "function f()\n  local n = 0\n  repeat\n    n = n + 1\n    local a, g = 1,\n  until n > 2\n  return n\nend\nValue {f()}.\n",
      "until",
    ],
    ["return", "function f()\n  local a, g = 1,\n  return 4\nend\nValue {f()}.\n", "return"],
    ["local", "function f()\n  local a, g = 1,\n  local b = 4\n  return b\nend\nValue {f()}.\n", "local"],
  ])("before %s: the error, and the keyword stays with its block", (_name, source, got) => {
    const { errorMessages, warningMessages } = collectDiagnostics(source);
    expect(errorMessages).toEqual([missingValue(got)]);
    expect(warningMessages.filter((w) => w.includes("Unknown global"))).toEqual([]);
  });

  test("before an assignment, the second `=` is the error", () => {
    const { errorMessages } = collectDiagnostics(
      "store x = 5\nfunction f()\n  local a = 1,\n  x = 99\n  return a\nend\nValue {f()} and {x}.\n",
    );
    expect(errorMessages).toEqual([
      "Expected identifier when parsing expression, got '='",
    ]);
  });

  test("after an operator line that ends with a comma, before `return`", () => {
    const { errorMessages } = collectDiagnostics(
      "function f()\n  local n = 3\n  local a, g = 1,\n    n\n    + 4,\n  return g\nend\nValue {f()}.\n",
    );
    expect(errorMessages).toEqual([missingValue("return")]);
  });

  test("before a name, the targets' comma is a missing binding name", () => {
    const { errorMessages } = collectDiagnostics("function f()\n  local a,\nend\n");
    expect(errorMessages).toEqual([
      "Expected identifier when parsing binding name, got 'end'",
    ]);
  });
});

describe("narrative body: the declaration ends at its line", () => {
  test.each([
    ["next line", "store a, b = 1,\n  2\n"],
    ["after a comment", "store a, b = 1, -- note\n  2\n"],
  ])("store: a value on the next line is story, and the comma is the error (%s)", (_name, declaration) => {
    const { errorMessages } = collectDiagnostics(`${declaration}Value {a}.\n`);
    expect(errorMessages).toEqual([missingValue("2")]);
  });

  test.each([
    ["prose", "store hp = 100,\n\nThe hero has {hp} health.\n", "The"],
    ["an em-dash action line", "store hp = 100,\n\n-- The hero staggers to his feet.\n\nHe has {hp} health.\n", "He"],
    ["dialogue", "store hp = 100,\n\nALICE:\n  The hero has {hp} health.\n", "ALICE"],
    ["a scene", "store hp = 100,\nscene one\n  Hi.\nend\n", "scene"],
  ])("before %s: the error, and the story line is untouched", (_name, source, got) => {
    const { errorMessages, warningMessages } = collectDiagnostics(source);
    expect(errorMessages).toEqual([missingValue(got)]);
    expect(warningMessages.filter((w) => w.includes("Unknown global"))).toEqual([]);
  });

  test.each([
    ["local", "local function f()\n  return 7\nend\nValue {f()}.\n"],
    ["store", "store function f()\n  return 7\nend\nValue {f()}.\n"],
    ["const", "const function f()\n  return 7\nend\nValue {f()}.\n"],
    ["local in a scene", "-> one\nscene one\n  local function f()\n    return 7\n  end\n  Value {f()}.\nend\n"],
  ])("a %s function is a function, not a declaration", (_name, source) => {
    const { errors, text } = run(source);
    expect(errors).toEqual([]);
    expect(text).toBe("Value 7.\n");
  });

  test("a keyword can name a define property", () => {
    const { errors, text } = run("define cfg with\n  repeat = 3\nend\nValue {cfg.repeat}.\n");
    expect(errors).toEqual([]);
    expect(text).toBe("Value 3.\n");
  });

  test("a declaration in an `&` statement ends at its line too", () => {
    const { errorMessages } = collectDiagnostics("& store hp = 100,\nThe hero has {hp} health.\n");
    expect(errorMessages).toEqual([missingValue("The")]);
  });
});
