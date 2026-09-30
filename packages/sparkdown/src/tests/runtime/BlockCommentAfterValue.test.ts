import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

// A block comment is trivia in Luau, so a statement after it on the same line
// is the next statement, not a continuation of the value before the comment
// (#1157). `print(1)` displays `1` before the returned value.
function run(body: string) {
  const source = `Value {f()}.\nfunction f()\n${body}\n  return w\nend\n`;
  const ctx = makeRuntimeStoryFromSource(source);
  return ctx.story.Continue();
}

describe("a statement after a same-line block comment after a value runs", () => {
  test.each([
    ["local, number", "  local w = 5 --[[c]] print(1)", "Value 15.\n"],
    [
      "reassignment, number",
      "  local w = 0\n  w = 5 --[[c]] print(1)",
      "Value 15.\n",
    ],
    ["hex number", "  local w = 0x5 --[[c]] print(1)", "Value 15.\n"],
    [
      "name",
      "  local x = 5\n  local w = x --[[c]] print(1)",
      "Value 15.\n",
    ],
    ["parenthesized", "  local w = (5) --[[c]] print(1)", "Value 15.\n"],
    ["string", '  local w = "5" --[[c]] print(1)', "Value 15.\n"],
    ["boolean", "  local w = true --[[c]] print(1)", "Value 1true.\n"],
    [
      "call result",
      "  local w = tostring(5) --[[c]] print(1)",
      "Value 15.\n",
    ],
    ["leveled comment", "  local w = 5 --[==[c]==] print(1)", "Value 15.\n"],
    ["no space before", "  local w = 5--[[c]] print(1)", "Value 15.\n"],
    [
      "assignment after",
      "  local w = 5 --[[c]] w = w + 1",
      "Value 6.\n",
    ],
    [
      "binary value",
      "  local w = 2 + 3 --[[c]] print(1)",
      "Value 15.\n",
    ],
    [
      "binary value, no space before",
      "  local w = 2 + 3--[[c]] print(1)",
      "Value 15.\n",
    ],
    [
      "reassignment, no space before",
      "  local w = 0\n  w = 5--[[c]] print(1)",
      "Value 15.\n",
    ],
    [
      "reassignment, assignment after",
      "  local w = 0\n  w = 5 --[[c]] w = w + 1",
      "Value 6.\n",
    ],
    [
      "logical value",
      "  local w = nil or 5 --[[c]] print(1)",
      "Value 15.\n",
    ],
    [
      "regex value",
      "  local w = 5\n  local r = @/x/ --[[c]] print(1)",
      "Value 15.\n",
    ],
    [
      "regex value with flags",
      "  local w = 5\n  local r = @/x/i --[[c]] print(1)",
      "Value 15.\n",
    ],
    [
      "parenthesized call statement after",
      "  local w = 5 --[[c]] (function() print(1) end)()",
      "Value 15.\n",
    ],
    [
      "reassignment, parenthesized call statement after",
      "  local w = 0\n  w = 5 --[[c]] (function() print(1) end)()",
      "Value 15.\n",
    ],
  ])("%s", (_name, body, expected) => {
    expect(run(body)).toBe(expected);
  });

  test.each([
    ["spaced", "  local w = ... --[[c]] print(1)"],
    ["no space before", "  local w = ...--[[c]] print(1)"],
  ])("vararg value, %s", (_name, body) => {
    const source = `Value {f(5)}.\nfunction f(...)\n${body}\n  return w\nend\n`;
    expect(makeRuntimeStoryFromSource(source).story.Continue()).toBe(
      "Value 15.\n",
    );
  });

  // A `(` after the comment is read as it is with no comment there: the next
  // statement after any value but a name.
  test.each([
    "5",
    "0x5",
    "5e0",
    "1_000",
    ".5",
    "5.",
    "true",
    "nil",
    '"s"',
    "[[s]]",
    "[=[s]=]",
    "{}",
    "{1}",
    "@/x/",
    "@/x/i",
    "function() end",
    "t[1]",
    "g()",
    "(g)",
  ])("a parenthesized statement after `%s` runs", (value) => {
    const body = `  local w = 5\n  local t = {1}\n  local g = function() end\n  local r = ${value} --[[c]] (function() print(1) end)()`;
    expect(run(body)).toBe("Value 15.\n");
  });

  test("a parenthesized statement after the comment calls a name, as without it", () => {
    const g = "  local g = function(v) return function() end end\n";
    expect(run(`${g}  local w = 5\n  local r = g (function() print(1) end)()`)).toBe(
      "Value 5.\n",
    );
    expect(
      run(`${g}  local w = 5\n  local r = g --[[c]] (function() print(1) end)()`),
    ).toBe("Value 5.\n");
  });

  // A comment between a callee and its arguments is trivia: the call stands.
  test.each([
    ["parentheses", "  local w = g --[[c]] (2)", "Value 6.\n"],
    ["parentheses, no spaces", "  local w = g--[[c]](2)", "Value 6.\n"],
    ["reassignment", "  local w = 0\n  w = g --[[c]] (2)", "Value 6.\n"],
    ["string argument", '  local w = s --[[c]] "x"', "Value x!.\n"],
    ["table argument", "  local w = t --[[c]] {2}", "Value 2.\n"],
  ])("a call with a comment before its %s", (_name, body, expected) => {
    const callees =
      '  local g = function(v) return v * 3 end\n  local s = function(v) return v .. "!" end\n  local t = function(v) return v[1] end\n';
    expect(run(callees + body)).toBe(expected);
  });

  // A call statement, not a value: the comment between the callee and its
  // arguments is trivia, so the call runs.
  test.each([
    ["on its line", "  g --[[c]] (2)"],
    ["with no spaces", "  g--[[c]](2)"],
    ["with a dotted callee", "  local t = {g = g}\n  t.g --[[c]] (2)"],
  ])("a call statement with a comment before its arguments, %s", (_name, call) => {
    const body = `  local w = 0\n  local g = function(v) w = v end\n${call}`;
    expect(run(body)).toBe("Value 2.\n");
  });

  test("the comment ending the line is the control", () => {
    expect(run("  local w = 5 --[[c]]\n  print(1)")).toBe("Value 15.\n");
  });

  test("subtracting a negation keeps its operator", () => {
    expect(run("  local w = 7 - -2")).toBe("Value 9.\n");
    expect(run("  local w = 7 - --[[c]] 2")).toBe("Value 5.\n");
  });

  test("a comment after an operator keeps the operand after it", () => {
    expect(run("  local x = 4\n  local w = nil or --[[c]] x")).toBe(
      "Value 4.\n",
    );
    expect(run("  local x = 4\n  local w = 0\n  w = 1 and --[[c]] x")).toBe(
      "Value 4.\n",
    );
    expect(run("  local x = 4\n  local w = 3 + --[[c]] x")).toBe(
      "Value 7.\n",
    );
    expect(run("  local x = 4\n  local w = 3 < --[[c]] x")).toBe(
      "Value true.\n",
    );
  });

  // #880: a line comment after arithmetic is a comment, not `- -`.
  test("a line comment after arithmetic is a comment", () => {
    expect(run("  local w = 1 * 2 -- the product")).toBe("Value 2.\n");
    expect(run("  local a, b = 3, 4\n  local w = a * b -- a note")).toBe(
      "Value 12.\n",
    );
  });

  // A literal type keeps reading past a block comment to its `?` or `|`, as
  // other types do.
  test.each([
    ["string type, `?`", '  local w: "a" --[[c]] ? = "a"', "Value a.\n"],
    ["boolean type, `?`", "  local w: true --[[c]] ? = true", "Value true.\n"],
    ["string union", '  local w: "a" --[[c]] | "b" = "a"', "Value a.\n"],
    ["number type, `?`", "  local w: number --[[c]] ? = 5", "Value 5.\n"],
    ["number union", "  local w: number --[[c]] | string = 5", "Value 5.\n"],
    [
      "table intersection",
      "  local v: {x: number} --[[c]] & {y: number} = {x = 5, y = 6}\n  local w = v.x",
      "Value 5.\n",
    ],
  ])("a %s after a block comment keeps its value", (_name, body, expected) => {
    expect(run(body)).toBe(expected);
  });

  test("a line comment after a value still ends the statement", () => {
    expect(run("  local w = 5 -- print(1)")).toBe("Value 5.\n");
  });

  // A leveled comment closes only at brackets of its own level.
  test.each([
    ["an operator", "  local w = 5 --[=[a]]b]=] + 1", "Value 6.\n"],
    ["a statement", "  local w = 5 --[=[a]]b]=] print(1)", "Value 15.\n"],
    [
      "an operator, at level four",
      "  local w = 5 --[====[a]=] print(9) b]====] + 1",
      "Value 6.\n",
    ],
    [
      "a statement, at level four",
      "  local w = 5 --[====[a]]b]====] print(1)",
      "Value 15.\n",
    ],
    [
      "an operator, at level five",
      "  local w = 5 --[=====[a]====]b]=====] + 1",
      "Value 6.\n",
    ],
    [
      "a type union",
      "  local w: number --[=[a]]b]=] | string = 5",
      "Value 5.\n",
    ],
  ])("a leveled comment holding `]]` before %s", (_name, body, expected) => {
    expect(run(body)).toBe(expected);
  });

  test("a comment right after `local` keeps the declaration", () => {
    expect(run("  local --[[c]] w = 5")).toBe("Value 5.\n");
  });

  test("the typed and multi-value forms end before the comment", () => {
    expect(run("  local w: number = 5 --[[c]] print(1)")).toBe("Value 15.\n");
    expect(run("  local a, w = 1, 5 --[[c]] print(1)")).toBe("Value 15.\n");
    expect(run("  local w = 1\n  w += 4 --[[c]] print(1)")).toBe("Value 15.\n");
  });
});

// A block comment after a value that closes on a later line: a statement
// after the close is the next statement, as on one line.
describe("a statement after a block comment spanning lines runs", () => {
  test.each([
    ["local", "  local w = 5 --[[a\n  ]] print(1)", "Value 15.\n"],
    [
      "reassignment",
      "  local w = 0\n  w = 5 --[[a\n  ]] print(1)",
      "Value 15.\n",
    ],
    ["binary value", "  local w = 2 + 3 --[[a\n  ]] print(1)", "Value 15.\n"],
    ["string value", '  local w = "5" --[[a\n  ]] print(1)', "Value 15.\n"],
    ["call value", "  local w = tostring(5) --[[a\n  ]] print(1)", "Value 15.\n"],
    ["leveled comment", "  local w = 5 --[==[a\n  ]==] print(1)", "Value 15.\n"],
    ["no space after the close", "  local w = 5 --[[a\n  ]]print(1)", "Value 15.\n"],
    [
      "reassignment, no space after the close",
      "  local w = 0\n  w = 5 --[[a\n  ]]print(1)",
      "Value 15.\n",
    ],
    ["assignment after", "  local w = 5 --[[a\n  ]] w = w + 1", "Value 6.\n"],
    [
      "if statement after",
      "  local w = 5 --[[a\n  ]] if w then print(1) end",
      "Value 15.\n",
    ],
    [
      "parenthesized statement after a number",
      "  local w = 5 --[[a\n  ]] (function() print(1) end)()",
      "Value 15.\n",
    ],
  ])("%s", (_name, body, expected) => {
    expect(run(body)).toBe(expected);
  });

  test.each([
    ["an operator", "  local w = 5 --[[a\n  ]] + 1", "Value 6.\n"],
    ["a concatenation", '  local w = "a" --[[a\n  ]] .. "b"', "Value ab.\n"],
    ["an operand", "  local w = 3 + --[[a\n  ]] 2", "Value 5.\n"],
    [
      "a call's arguments",
      "  local g = function(v) return v * 3 end\n  local w = g --[[a\n  ]] (2)",
      "Value 6.\n",
    ],
    [
      "a list's next value",
      "  local t = {5 --[[a\n  ]], 6}\n  local w = t[2]",
      "Value 6.\n",
    ],
  ])("the value goes on past the comment to %s", (_name, body, expected) => {
    expect(run(body)).toBe(expected);
  });
});
