import { describe, expect, test } from "vitest";
import {
  isNameChar,
  JOINING_PAIRS,
  joinsAcrossSpace,
} from "../../compiler/utils/lexicalJoin";

const EXPECTED_PAIRS = [
  "--",
  "..",
  "==",
  "~=",
  "<=",
  ">=",
  "//",
  "::",
  "->",
  "[[",
  "[=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "^=",
];

describe("lexicalJoin", () => {
  test("the shared inventory is exactly the pairs both callers keep", () => {
    expect([...JOINING_PAIRS].sort()).toEqual([...EXPECTED_PAIRS].sort());
  });

  test.each(EXPECTED_PAIRS)("%s joins across removed space", (pair) => {
    expect(joinsAcrossSpace(pair[0]!, pair[1]!)).toBe(true);
  });

  test.each([
    ["(", ")"],
    [",", "-"],
    ["=", "("],
    ["+", "+"],
    ["]", "]"],
    [".", "="],
    ["a", "("],
    [")", "a"],
  ])("%s%s does not join", (before, after) => {
    expect(joinsAcrossSpace(before, after)).toBe(false);
  });

  test.each(["a", "Z", "_", "7", "é", "ж", "名", "٣", "ß"])(
    "%s is a name character",
    (char) => {
      expect(isNameChar(char)).toBe(true);
      expect(joinsAcrossSpace(char, "x")).toBe(true);
    },
  );

  test.each([" ", ".", "-", "(", "$", "@", "·"])(
    "%s is not a name character",
    (char) => {
      expect(isNameChar(char)).toBe(false);
    },
  );
});
