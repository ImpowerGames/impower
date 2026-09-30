// A reassignment whose value list ends its line with a comma. In Luau code (a
// function body or a Luau block) the list continues on the next line, as in
// Luau and as a declaration's does (`TrailingCommaValueList.test.ts`): a
// comment after the comma, or blank and comment-only lines before the next
// value, leave the list open. A line that starts with a statement belongs to
// the enclosing block, and the comma before it is Luau's parse error. In a
// narrative body the reassignment ends at its line: the next line is story,
// and a comma that ends the line is the same error.

import { describe, expect, test } from "vitest";
import { collectDiagnostics, makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  const errors = [...ctx.errorMessages];
  ctx.story.onError = (m: string) => errors.push(m);
  const text = ctx.story.Continue();
  return { errors, text };
}

const fn = (body: string, ret: string) =>
  `Value {f()}.\nfunction f()\n  local a, g = 0, 0\n  local t = { a = 0, g = 0 }\n${body}\n  ${ret}\nend\n`;

describe("Luau code: a reassignment list continues after a trailing comma", () => {
  test.each([
    ["next line", "  a, g = 1,\n    2", "return g", "Value 2.\n"],
    ["after a comment", "  a, g = 1, -- note\n    2", "return g", "Value 2.\n"],
    ["earlier slot untouched", "  a, g = 1,\n    2", "return a", "Value 1.\n"],
    ["field targets", "  t.a, t.g = 1,\n    2", "return t.g", "Value 2.\n"],
    [
      "three lines",
      "  local b = 0\n  a, g, b = 1,\n    2,\n    3",
      "return a + g * 10 + b * 100",
      "Value 321.\n",
    ],
    [
      "blank and comment lines between",
      "  a, g = 1,\n\n    -- the second value\n    2",
      "return g",
      "Value 2.\n",
    ],
    ["call on the next line", "  a, g = 1,\n    math.max(2, 5)", "return g", "Value 5.\n"],
    [
      "a variable on the next line",
      "  local b = 4\n  a, g = 1,\n    b",
      "return g",
      "Value 4.\n",
    ],
    [
      "an anonymous function on the next line",
      "  a, g = 1,\n    function() return 7 end",
      "return g()",
      "Value 7.\n",
    ],
    [
      "an if expression on the next line",
      "  local b = 1\n  a, g = 1,\n    if b == 1 then 8 else 9",
      "return g",
      "Value 8.\n",
    ],
    [
      "a name continued by an operator line",
      "  local n, c = 3, 0\n  a, g, c = 1,\n    n\n    + 4,\n    5",
      "return g * 10 + c",
      "Value 75.\n",
    ],
    ["an extra value for a single target", "  g = 1,\n    2", "return g", "Value 1.\n"],
    [
      "a comment-only line, then a blank line",
      "  t.a, t.g = 1,\n    -- comment-only line\n\n    2",
      "return t.g",
      "Value 2.\n",
    ],
    ["a negative value on the next line", "  a, g = 1,\n    -2", "return g", "Value -2.\n"],
    ["a `not` value on the next line", "  a, g = 1,\n    not a", "return tostring(g)", "Value false.\n"],
    ["a length value on the next line", "  a, g = 1,\n    #t", "return g", "Value 0.\n"],
    ["a number with a leading point on the next line", "  a, g = 1,\n    .5", "return g", "Value 0.5.\n"],
    ["a value on an unindented line", "  a, g = 1,\n2", "return g", "Value 2.\n"],
    [
      "an if expression on an unindented line",
      "  local c = true\n  a, g = 1,\nif c then 2 else 3",
      "return g",
      "Value 2.\n",
    ],
  ])("%s", (_name, body, ret, expected) => {
    const { errors, text } = run(fn(body, ret));
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  test.each([
    ["two reassignments", "  a = 1 a = 2", "return a", "Value 2.\n"],
    ["a swap", "  a, g = 1, 2\n  g = 2 a, g = g, a", "return a * 10 + g", "Value 21.\n"],
    ["a call after it", "  local r = {}\n  a = 1 table.insert(r, 5)", "return r[1]", "Value 5.\n"],
    ["a complete list then a statement", "  a, g = 1, 2\n  g = 3", "return g", "Value 3.\n"],
  ])("same-line statements stay separate: %s", (_name, body, ret, expected) => {
    const { errors, text } = run(fn(body, ret));
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  // Luau evaluates every value, then assigns as many as there are targets.
  const bump = "  local calls = 0\n  local function bump() calls = calls + 1 return 9 end\n";
  test.each([
    ["on the next line", `${bump}  g = 1,\n    bump()`, "return g * 10 + calls"],
    ["on the same line", `${bump}  g = 1, bump()`, "return g * 10 + calls"],
    ["to a field target", `${bump}  t.g = 1,\n    bump()`, "return t.g * 10 + calls"],
  ])("an extra value for a single target is still evaluated (%s)", (_name, body, ret) => {
    const { errors, text } = run(fn(body, ret));
    expect(errors).toEqual([]);
    expect(text).toBe("Value 11.\n");
  });

  test.each([
    [
      "in a narrative body",
      "store g = 0\nstore calls = 0\nfunction bump()\n  calls += 1\n  return 9\nend\n& g = 1, bump()\nValue {g * 10 + calls}.\n",
    ],
    [
      "in a function body",
      `Value {f()}.\nfunction f()\n${bump}  local g = 0\n  & g = 1, bump()\n  return g * 10 + calls\nend\n`,
    ],
  ])("an extra value for a single target after `&` is still evaluated (%s)", (_name, source) => {
    const { errors, text } = run(source);
    expect(errors).toEqual([]);
    expect(text).toBe("Value 11.\n");
  });
});

// Luau's parse error for the missing value, reported on the comma's line.
const missingValue = (got: string) =>
  `Expected identifier when parsing expression, got '${got}'`;

describe("Luau code: a reassignment comma with nothing after it", () => {
  test.each([
    ["end", "function f()\n  local a, g = 0, 0\n  a, g = 1,\nend\nValue {f()}.\n", "end"],
    [
      "else",
      "function f(ok)\n  local a, g = 0, 0\n  if ok then\n    a, g = 1,\n  else\n    return 2\n  end\nend\nValue {f(false)}.\n",
      "else",
    ],
    [
      "until",
      "function f()\n  local n, a, g = 0, 0, 0\n  repeat\n    n = n + 1\n    a, g = 1,\n  until n > 2\n  return n\nend\nValue {f()}.\n",
      "until",
    ],
    ["return", "function f()\n  local a, g = 0, 0\n  a, g = 1,\n  return 4\nend\nValue {f()}.\n", "return"],
    ["local", "function f()\n  local a, g = 0, 0\n  a, g = 1,\n  local b = 4\n  return b\nend\nValue {f()}.\n", "local"],
    ["end, after a single target", "function f()\n  local g = 0\n  g = 1,\nend\nValue {f()}.\n", "end"],
    [
      "return, after an operator line that ends with a comma",
      "function f()\n  local a, g, n = 0, 0, 3\n  a, g = 1,\n    n\n    + 4,\n  return g\nend\nValue {f()}.\n",
      "return",
    ],
  ])("before %s: the error, and the keyword stays with its block", (_name, source, got) => {
    const { errorMessages, warningMessages } = collectDiagnostics(source);
    expect(errorMessages).toEqual([missingValue(got)]);
    expect(warningMessages.filter((w) => w.includes("Unknown global"))).toEqual([]);
  });

  test("before an assignment, the second `=` is the error", () => {
    const { errorMessages } = collectDiagnostics(
      "function f()\n  local a, g, x = 0, 0, 0\n  a, g = 1,\n  x = 99\n  return a\nend\nValue {f()}.\n",
    );
    expect(errorMessages).toEqual([missingValue("=")]);
  });

  // Every other statement that can start the line after the comma, each in a
  // place it can stand, and the statement stays with its block.
  const inLoop = (line: string) =>
    `function f()\n  local a, g = 0, 0\n  for i = 1, 2 do\n    a, g = 1,\n    ${line}\n  end\n  return a\nend\nValue {f()}.\n`;
  const inBody = (lines: string) =>
    `function f()\n  local a, g = 0, 0\n  a, g = 1,\n${lines}\n  return a\nend\nValue {f()}.\n`;
  test.each([
    ["break", inLoop("break"), "break"],
    ["continue", inLoop("continue"), "continue"],
    ["goto", inBody("  goto done\n  ::done::"), "goto"],
    ["a label", inBody("  ::done::"), ":"],
    ["do", inBody("  do\n    a = 2\n  end"), "do"],
    ["while", inBody("  while false do\n  end"), "while"],
    ["for", inBody("  for i = 1, 2 do\n  end"), "for"],
    ["repeat", inBody("  repeat\n  until true"), "repeat"],
    ["a named function", inBody("  function h()\n    return 1\n  end"), "function"],
    ["a store declaration", inBody("  store s = 4"), "store"],
    ["a type declaration", inBody("  type T = number"), "type"],
    ["a define", inBody("  define cfg with\n    k = 1\n  end"), "define"],
    [
      "elseif",
      "function f(ok)\n  local a, g = 0, 0\n  if ok then\n    a, g = 1,\n  elseif not ok then\n    return 2\n  end\nend\nValue {f(false)}.\n",
      "elseif",
    ],
  ])("before %s: the error", (_name, source, got) => {
    const { errorMessages } = collectDiagnostics(source);
    expect(errorMessages).toEqual([missingValue(got)]);
  });

  test("a `&` statement in a function body ends at its line", () => {
    const { errorMessages } = collectDiagnostics(
      "function f()\n  local a, g = 0, 0\n  & a, g = 1,\n  return g\nend\nValue {f()}.\n",
    );
    expect(errorMessages).toContain(missingValue("return"));
  });
});

describe("Luau code: an operator that cannot begin a value after a comma", () => {
  test.each([
    ["on the next line", "  a, g = 1,\n    + 2", "+"],
    ["after a comment-only line", "  a, g = 1,\n    -- c\n\n+    2", "+"],
    ["on the same line", "  a, g = 1, * 2", "*"],
    ["`and` on the next line", "  a, g = 1,\n    and a", "and"],
    ["a method call on the next line", "  a, g = 1,\n    :method()", ":"],
    ["a method call on the same line", "  a, g = 1, :method()", ":"],
    ["a field on the next line", "  a, g = 1,\n    .x", "."],
    ["an indexer on the next line", "  a, g = 1,\n    [1]", "["],
  ])("%s: the error", (_name, body, got) => {
    const { errorMessages } = collectDiagnostics(fn(body, "return g"));
    expect(errorMessages).toEqual([missingValue(got)]);
  });
});

describe("narrative body: the reassignment ends at its line", () => {
  test.each([
    ["next line", "  a, b = 1,\n  2\n"],
    ["after a comment", "  a, b = 1, -- note\n  2\n"],
  ])("a value on the next line is story, and the comma is the error (%s)", (_name, body) => {
    const { errorMessages } = collectDiagnostics(
      `store a, b = 0, 0\n-> one\nscene one\n${body}  Value {a}.\nend\n`,
    );
    expect(errorMessages).toEqual([missingValue("2")]);
  });

  test("before prose: the error, and the story line is untouched", () => {
    const { errorMessages, warningMessages } = collectDiagnostics(
      "store a, b = 0, 0\n-> one\nscene one\n  a, b = 1,\n  The hero has {a} health.\nend\n",
    );
    expect(errorMessages).toEqual([missingValue("The")]);
    expect(warningMessages.filter((w) => w.includes("Unknown global"))).toEqual([]);
  });

  test.each([
    ["two targets", "store a, b = 0, 0\n& a, b = 1,\nThe hero has {a} health.\n"],
    ["one target", "store a = 0\n& a = 1,\nThe hero has {a} health.\n"],
  ])("a reassignment in an `&` statement ends at its line too (%s)", (_name, source) => {
    const { errorMessages } = collectDiagnostics(source);
    expect(errorMessages).toEqual([missingValue("The")]);
  });

  test("a complete list is not an error", () => {
    const { errorMessages } = collectDiagnostics(
      "store a, b = 0, 0\n-> one\nscene one\n  a, b = 1, 2\n  Value {a}.\nend\n",
    );
    expect(errorMessages).toEqual([]);
  });

  test("in a sparkdown `if` around story: the error, and the story line is untouched", () => {
    const { errorMessages, warningMessages } = collectDiagnostics(
      "store a, b = 0, 0\n-> one\nscene one\n  if true then\n    a, b = 1,\n    The hero has {a} health.\n  end\nend\n",
    );
    expect(errorMessages).toEqual([missingValue("The")]);
    expect(warningMessages.filter((w) => w.includes("Unknown global"))).toEqual([]);
  });
});
