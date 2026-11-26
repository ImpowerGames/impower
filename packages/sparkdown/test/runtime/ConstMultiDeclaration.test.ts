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

describe("a top-level const with more than one name or value", () => {
  test.each([
    ["two values", "const a = 1, 2\nscene start\n  Value {a}.\nend\n"],
    [
      "two names and values",
      "const a, g = 1, 2\nscene start\n  Value {a} {g}.\nend\n",
    ],
    [
      "two names, one value",
      "const a, g = 1\nscene start\n  Value {a} {g}.\nend\n",
    ],
  ])("%s reports the rule on the declaration", (_label, source) => {
    const { errors } = run(source);
    expect(errors.filter((m) => m.includes(RULE))).toHaveLength(1);
  });

  test.each([
    [
      "table",
      "const t = {x = 1, y = 2}\nscene start\n  Value {t.y}.\nend\n",
      "Value 2.\n",
    ],
    [
      "string",
      'const s = "a, b"\nscene start\n  Value {s}.\nend\n',
      "Value a, b.\n",
    ],
    [
      "call arguments",
      "const m = math.max(1, 2)\nscene start\n  Value {m}.\nend\n",
      "Value 2.\n",
    ],
  ])("commas inside a single value (%s) are not extra values", (_l, source, expected) => {
    const { errors, text } = run(source);
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  test("a single const still declares its constant", () => {
    const { errors, text } = run(
      "const a = 1\nscene start\n  Value {a}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Value 1.\n");
  });
});

describe("a const inside a function reads as Luau reads it", () => {
  test.each([
    [
      "one name, two values",
      "scene start\n  Value {f()}.\nend\nfunction f()\n  const a = 1, 2\n  return a\nend\n",
      "Value 1.\n",
    ],
    [
      "two names and values",
      "scene start\n  Value {f()}.\nend\nfunction f()\n  const a, g = 1, 2\n  return a + g\nend\n",
      "Value 3.\n",
    ],
  ])("%s declares its names", (_label, source, expected) => {
    const { errors, text } = run(source);
    expect(errors).toEqual([]);
    expect(text).toBe(expected);
  });

  test("two names and one value report Luau's missing initializer", () => {
    const { errors } = run(
      "scene start\n  Value {f()}.\nend\nfunction f()\n  const a, g = 1\n  return a\nend\n",
    );
    expect(errors).toEqual(["Missing initializer in const declaration"]);
  });
});
