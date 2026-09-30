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
  ])("a %s after a block comment keeps its value", (_name, body, expected) => {
    expect(run(body)).toBe(expected);
  });

  test("a line comment after a value still ends the statement", () => {
    expect(run("  local w = 5 -- print(1)")).toBe("Value 5.\n");
  });
});
