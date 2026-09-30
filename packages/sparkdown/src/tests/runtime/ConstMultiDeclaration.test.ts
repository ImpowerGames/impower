// A `const` takes one name and one value. The lowerer used to drop a `const`
// with more names or values without a diagnostic, so the constant was never
// declared and every read of it was nil, with only a warning at each read.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const RULE = "A `const` takes one name and one value";

function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  return {
    errors: [...ctx.errorMessages],
    text: ctx.story.Continue(),
  };
}

describe("const with more than one name or value", () => {
  test.each([
    ["two values", "const a = 1, 2\nValue {a}.\n"],
    ["two names and values", "const a, g = 1, 2\nValue {a} {g}.\n"],
    ["two names, one value", "const a, g = 1\nValue {a} {g}.\n"],
    [
      "inside a function body",
      "Value {f()}.\nfunction f()\n  const a = 1, 2\n  return a\nend\n",
    ],
  ])("%s reports the rule on the declaration", (_label, source) => {
    const { errors } = run(source);
    expect(errors.filter((m) => m.includes(RULE))).toHaveLength(1);
  });

  test.each([
    ["table", 'const t = {x = 1, y = 2}\nValue {t.y}.\n', "Value 2.\n"],
    ["string", 'const s = "a, b"\nValue {s}.\n', "Value a, b.\n"],
    ["call arguments", "const m = math.max(1, 2)\nValue {m}.\n", "Value 2.\n"],
  ])("commas inside a single value (%s) are not extra values", (_l, source, expected) => {
    const { errors, text } = run(source);
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  test("a single const still declares its constant", () => {
    const { errors, text } = run("const a = 1\nValue {a}.\n");
    expect(errors).toEqual([]);
    expect(text).toBe("Value 1.\n");
  });
});
