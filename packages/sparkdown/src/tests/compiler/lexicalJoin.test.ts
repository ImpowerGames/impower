import { describe, expect, test } from "vitest";
import {
  isNameChar,
  JOINING_PAIRS,
  joinsAcrossSpace,
} from "../../compiler/utils/lexicalJoin";
import { normalizeSource } from "../../compiler/utils/fingerprintSource";

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

describe("the program normalizer keeps the space only where removing it joins two tokens", () => {
  const NORMALIZER_ONLY = ["]]", "=]", "<-", "=>", "!=", "&&", "||", "<<", ">>"];

  test.each([...EXPECTED_PAIRS, ...NORMALIZER_ONLY])(
    "%s keeps its space",
    (pair) => {
      expect(normalizeSource(`& x = y ${pair[0]} ${pair[1]} z`)).toBe(
        `&x=y${pair[0]} ${pair[1]}z`,
      );
    },
  );

  test.each([".=", "((", "))", ",,"])("%s loses its space", (pair) => {
    expect(normalizeSource(`& x = y ${pair[0]} ${pair[1]} z`)).toBe(
      `&x=y${pair}z`,
    );
  });
});
