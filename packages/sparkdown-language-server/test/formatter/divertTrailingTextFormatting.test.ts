import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting stray text after a divert", () => {
  for (const line of [
    "HERO: Go -> later > After",
    "A -> later > After",
    "-> later > After",
    "A -> later ! After",
    "+ [Go] -> later > After",
    "A -> later more words",
    "A -> later    > After",
  ]) {
    test(`leaves ${JSON.stringify(line)} as written`, () => {
      const source = `${line}\n`;
      expect(formatSource(source)).toBe(source);
    });
  }

  test("still trims whitespace after the target at the end of the line", () => {
    expect(formatSource("A -> later   \n")).toBe("A -> later\n");
  });
});
