// Glue has a `..` on each side: a line that ends with `..` joins the next
// line shown when that line begins with `..`, keeping the spaces written
// before the first mark, so `A ..` then `.. B` joins with a space and `A..`
// then `..B` with none, and `A .. >` then `.. B` clicks and carries on in the
// same box. The spaces are the author's, so the formatter keeps the whitespace
// written before a `..` that ends a line or a part and inserts none into
// `A..`, and it leaves a `..` that begins a line's text, after a cue's colon
// too, and the spaces after it as written.

import { describe, expect, test } from "vitest";
import { formatSource } from "./formatSource";

describe("formatting a `..` that ends a line", () => {
  for (const line of [
    "A ..",
    "A   ..",
    "A..",
    "A .. >",
    "A.. >",
    "HERO: Wait..",
    "HERO: Abso.. >",
    "$: The heading ..",
  ]) {
    test(`leaves ${JSON.stringify(line)} as written`, () => {
      const source = `${line}\n.. B\n`;
      expect(formatSource(source)).toBe(source);
    });
  }

  test("leaves a block body's trailing `..` as written", () => {
    const source = `HERO:\n  A..\n  ..B .. >\n  .. C   ..\n  .. D\n`;
    expect(formatSource(source)).toBe(source);
  });
});

describe("formatting a leading `..`", () => {
  for (const source of [
    `A ..\n.. B\n`,
    `A ..\n..B\n`,
    `A ..\n..   B\n`,
    `HERO:\n  A ..\n  .. B\n`,
    `HERO: A ..\nHERO: .. B\n`,
    `HERO: A ..\nHERO: ..B\n`,
    `HERO: A .. >\nALICE: ..   B\n`,
    `$: A ..\n$: .. B\n`,
    `A .. > .. B\n`,
    `You see a ..\nif has_key then\n  .. rusty key.\nelse\n  .. locked door.\nend\n`,
  ]) {
    test(`leaves ${JSON.stringify(source)} as written`, () => {
      expect(formatSource(source)).toBe(source);
    });
  }

  // After an interpolation on its line the mark is text the player sees, and
  // so are the spaces after it. The space before it separates two statements
  // and shows nothing.
  test("keeps the spaces after a `..` that follows an interpolation", () => {
    for (const [source, formatted] of [
      [`{3} ..   and more.\n`, `{3}..   and more.\n`],
      [`{3} .. and more.\n`, `{3}.. and more.\n`],
    ] as const) {
      expect(formatSource(source)).toBe(formatted);
    }
  });
});
