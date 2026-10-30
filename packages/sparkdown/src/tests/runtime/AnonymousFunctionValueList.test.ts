import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  const errors = [...ctx.errorMessages];
  ctx.story.onError = (m: string) => errors.push(m);
  const text = ctx.story.Continue();
  return { errors, text };
}

const local = (declaration: string, body: string) =>
  `scene start\n  Value {f()}.\nend\nfunction f()\n  ${declaration}\n  ${body}\nend\n`;

describe("anonymous function in a declaration value list", () => {
  test.each([
    ["two values", "local a, g = 1, function() return 7 end", "return g()", "Value 7.\n"],
    [
      "middle of three",
      "local a, g, b = 1, function() return 7 end, 2",
      "return g() + b",
      "Value 9.\n",
    ],
    ["earlier slot untouched", "local a, g = 1, function() return 7 end", "return a", "Value 1.\n"],
    [
      "parenthesized control",
      "local a, g = 1, (function() return 7 end)",
      "return g()",
      "Value 7.\n",
    ],
    [
      "function first",
      "local g, a = function() return 7 end, 1",
      "return g() + a",
      "Value 8.\n",
    ],
  ])("local: %s", (_name, declaration, body, expected) => {
    const { errors, text } = run(local(declaration, body));
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  test("a named function on the same line stays a trailing statement", () => {
    const { errors, text } = run(
      local("local x = 5 function h() return 3 end", "return x + h()"),
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Value 8.\n");
  });

  test("a named function directly after a comma is the slot's value, and an error", () => {
    const { errors, text } = run(
      local("local a, g = 1, function named() return 7 end", "return g()"),
    );
    expect(errors).toEqual(["Expected '(' when parsing function, got 'named'"]);
    expect(text).toBe("Value 7.\n");
  });

  test.each([
    ["two values", "store a, g = 1, function() return 7 end"],
    ["parenthesized control", "store a, g = 1, (function() return 7 end)"],
  ])("store: %s", (_name, declaration) => {
    const ctx = makeRuntimeStoryFromSource(
      `${declaration}\nscene start\n  Value {a + g()}.\nend\n`,
    );
    const errors = [...ctx.errorMessages];
    ctx.story.onError = (m: string) => errors.push(m);
    const text = ctx.story.Continue();
    expect(errors).toEqual([]);
    expect(text).toBe("Value 8.\n");
  });
});
