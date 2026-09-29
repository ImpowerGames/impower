// A `local` or `store` value list that ends its line with a comma continues
// on the next line, as in Luau: a comma ends nothing. A comment after the
// comma, or blank and comment-only lines before the next value, leave the
// list open too.

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
  `Value {f()}.\nfunction f()\n${declaration}\n  ${body}\nend\n`;

describe("declaration value list continued after a trailing comma", () => {
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
      "targets continued too",
      "  local a,\n    g = 1, 2",
      "return a + g * 10",
      "Value 21.\n",
    ],
  ])("local: %s", (_name, declaration, body, expected) => {
    const { errors, text } = run(local(declaration, body));
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  test("a statement after a complete list stays its own statement", () => {
    const { errors, text } = run(local("  local a, g = 1, 2\n  g = 3", "return g"));
    expect(errors).toEqual([]);
    expect(text).toBe("Value 3.\n");
  });

  test.each([
    ["next line", "store a, g = 1,\n  2"],
    ["after a comment", "store a, g = 1, -- note\n  2"],
  ])("store: %s", (_name, declaration) => {
    const { errors, text } = run(`${declaration}\nValue {a + g * 10}.\n`);
    expect(errors).toEqual([]);
    expect(text).toBe("Value 21.\n");
  });
});
