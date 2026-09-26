// A `// note` after a divert is a comment, as it is after any other display
// text, so formatting keeps one space before it rather than joining it to the
// divert's target.

import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a `//` comment after a divert", () => {
  for (const line of [
    "Hello // note",
    "A -> later // note",
    "-> later // note",
    "HERO: Go -> later // note",
    "+ [Go] -> later // note",
  ]) {
    test(`leaves ${JSON.stringify(line)} as written`, () => {
      const source = `${line}\n`;
      expect(formatSource(source)).toBe(source);
    });
  }

  test("brings the space before the comment to one", () => {
    expect(formatSource("A -> later    // note\n")).toBe(
      "A -> later // note\n",
    );
  });
});
