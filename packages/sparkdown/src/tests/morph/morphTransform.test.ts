import { describe, expect, test } from "vitest";
import { IDENTITY, multiply, parseTransform, type Affine } from "../../morph/affine";

const close = (actual: Affine | null, expected: Affine) => {
  expect(actual).not.toBeNull();
  actual!.forEach((n, i) => expect(n).toBeCloseTo(expected[i]!, 12));
};

describe("parseTransform", () => {
  test("reads the transform-list grammar", () => {
    expect(parseTransform(undefined)).toEqual(IDENTITY);
    expect(parseTransform("")).toEqual(IDENTITY);
    expect(parseTransform(" \t\r\n")).toEqual(IDENTITY);
    expect(parseTransform("translate(5 0)")).toEqual([1, 0, 0, 1, 5, 0]);
    expect(parseTransform("translate(5)")).toEqual([1, 0, 0, 1, 5, 0]);
    expect(parseTransform(" translate( 5 , -.5e1 ) ")).toEqual([1, 0, 0, 1, 5, -5]);
    expect(parseTransform("\ttranslate\n(5,0)\r")).toEqual([1, 0, 0, 1, 5, 0]);
    expect(parseTransform("matrix(1,2,3,4,5,6)")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(parseTransform("scale(2)")).toEqual([2, 0, 0, 2, 0, 0]);
    expect(parseTransform("scale(2 3)")).toEqual([2, 0, 0, 3, 0, 0]);
    close(parseTransform("rotate(90)"), [0, 1, -1, 0, 0, 0]);
    close(parseTransform("rotate(90 1 1)"), [0, 1, -1, 0, 2, 0]);
    close(parseTransform("skewX(45)"), [1, 0, 1, 1, 0, 0]);
    close(parseTransform("skewY(45)"), [1, 1, 0, 1, 0, 0]);
    const both = multiply([1, 0, 0, 1, 5, 0], [2, 0, 0, 2, 0, 0]);
    expect(parseTransform("translate(5) scale(2)")).toEqual(both);
    expect(parseTransform("translate(5),scale(2)")).toEqual(both);
    expect(parseTransform("translate(5) ,\n scale(2)")).toEqual(both);
  });

  test("returns null for text outside the grammar", () => {
    for (const text of [
      " translate(5 0)",
      "translate(5px,0)",
      "translate(5 junk 0)",
      "translate(5 0) ",
      "translate(5 0)",
      "translate(5) scale(2)",
      "translate(5\f0)",
      "translate(5.)",
      "translate(1-2)",
      "translate(5,,0)",
      "translate(,5)",
      "translate()",
      "translate(5)scale(2)",
      "translate(5),,scale(2)",
      "translate(5),",
      "translate(5",
      "translate((5))",
      "bogus(5)",
      "translate(1 2 3)",
      "matrix(1 2 3 4 5)",
      "rotate(1 2)",
      "translate(1e400)",
      "scale(1e300) scale(1e300)",
    ]) {
      expect(parseTransform(text), JSON.stringify(text)).toBeNull();
    }
  });
});
