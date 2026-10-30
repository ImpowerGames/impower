import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a `//` comment after a divert", () => {
  for (const line of [
    "Hello // note",
    "A -> later // note",
    "-> later // note",
    "HERO: Go -> later // note",
    "+ [Go] -> later // note",
    "-> a -> later // note",
    "A -> a -> later // note",
  ]) {
    test(`leaves ${JSON.stringify(line)} as written`, () => {
      const source = `${line}\n`;
      expect(formatSource(source)).toBe(source);
    });
  }

  for (const line of [
    "x .. queue|-> A > y|b .. z",
    "queue | -> a -> b > y | c end",
  ]) {
    test(`leaves the stray text in ${JSON.stringify(line)} as written`, () => {
      const source = `${line}\n`;
      expect(formatSource(source)).toBe(source);
    });
  }

  test("brings the space before the comment to one", () => {
    expect(formatSource("A -> later    // note\n")).toBe(
      "A -> later // note\n",
    );
    expect(formatSource("-> a -> later    // note\n")).toBe(
      "-> a -> later // note\n",
    );
  });
});
