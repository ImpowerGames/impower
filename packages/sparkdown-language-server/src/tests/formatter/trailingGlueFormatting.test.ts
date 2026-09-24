// A `..` that ends a line joins the next line onto it, keeping the spaces
// written before the mark: `A ..` joins with a space, `A..` with none, and
// `A >..` clicks and then joins with none. The spaces are the author's, so the
// formatter keeps the whitespace written before a `..` and inserts none into
// `A..` or `>..`. A `..` that begins a line states that the line continues the
// one before it, and the formatter leaves it and the spaces after it as
// written.

import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a trailing `..`", () => {
  for (const line of [
    "A ..",
    "A   ..",
    "A..",
    "A >..",
    "A > ..",
    "HERO: Wait..",
    "HERO: Abso >..",
    "$: The heading ..",
  ]) {
    test(`leaves ${JSON.stringify(line)} as written`, () => {
      const source = `${line}\nB\n`;
      expect(formatSource(source)).toBe(source);
    });
  }

  test("leaves a block body's trailing `..` as written", () => {
    const source = `HERO:\n  A..\n  B >..\n  C   ..\n  D\n`;
    expect(formatSource(source)).toBe(source);
  });
});

describe("formatting a leading `..`", () => {
  for (const source of [
    `A ..\n.. B\n`,
    `A ..\n..B\n`,
    `A ..\n..   B\n`,
    `HERO:\n  A ..\n  .. B\n`,
    `You see a ..\nif has_key then\n  .. rusty key.\nelse\n  .. locked door.\nend\n`,
  ]) {
    test(`leaves ${JSON.stringify(source)} as written`, () => {
      expect(formatSource(source)).toBe(source);
    });
  }
});
