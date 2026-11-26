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
    `Before > .. load forest\n`,
    `Before > ..load forest\n`,
    `Before .. > ..   load forest\n`,
    `Before > ..\tload forest\n`,
    `:\n  .. load forest\n`,
    `:\n  ..load forest\n`,
    `:\n  ..   load forest\n`,
    `:\n  ..\tload forest\n`,
    `You see a ..\nif has_key then\n  .. rusty key.\nelse\n  .. locked door.\nend\n`,
  ]) {
    test(`leaves ${JSON.stringify(source)} as written`, () => {
      expect(formatSource(source)).toBe(source);
    });
  }

  test("keeps the spaces around a `..` that follows an interpolation", () => {
    for (const source of [
      `{3} ..   and more.\n`,
      `{3} .. and more.\n`,
      `{3}..   and more.\n`,
    ]) {
      expect(formatSource(source)).toBe(source);
    }
  });
});

test("load keyword formatting keeps ordinary action boundaries", () => {
  for (const source of [
    "load forest\n",
    "Before > load forest\n",
    ": load forest\n",
    ":\n  load forest\n",
  ]) {
    expect(formatSource(source)).toBe(source);
  }
});

describe("formatting the text after a glued alternator that begins a line", () => {
  for (const [source, tail] of [
    [`BUNNY: .. queue | Hi | Hello ..   there.\n`, `..   there.\n`],
    [`$: .. cycle | INT. | EXT. ..   HOUSE\n`, `..   HOUSE\n`],
  ] as const) {
    test(`keeps ${JSON.stringify(tail)} in ${JSON.stringify(source)}`, () => {
      expect(formatSource(source).endsWith(tail)).toBe(true);
    });
  }
});
