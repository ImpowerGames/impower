import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

const hasRegex = (source: string) =>
  stripAnsi(dumpTree(source)).includes("LuauRegexLiteral");

describe("division is never mistaken for a regex", () => {
  test.each([
    ["two interpolations, one line", "-> s\nscene s\n  {10/2} and {10 / 2}\nend\n"],
    ["one interpolation", "-> s\nscene s\n  {10/2}\nend\n"],
    ["spaced", "store a = 10\nstore b = a / 2\n"],
    ["unspaced", "store a = 10\nstore b = a/2\n"],
    ["chained", "store a = 10\nstore b = a/b/c\n"],
    ["two statements, two slashes", "store a = 1/2\nstore b = 3/4\n"],
    ["parenthesized", "store a = 10\nstore b = a / (b + c)\n"],
    ["`//` line comment", "store a = 1 // a comment\n"],
  ])("%s", (_label, source) => {
    expect(hasRegex(source)).toBe(false);
  });
});

describe("a sigil-prefixed literal IS a regex", () => {
  test.each([
    ["struct property", "define t as typewriter with\n  voiced = @/(a)/u\nend\n"],
    ["assignment", "store re = @/(a)/u\n"],
    ["call argument", "store x = f(@/(a)/u)\n"],
    ["table value", "store t = { p = @/(a)/u }\n"],
    ["contains a slash-looking body", "store re = @/(?:^|\\b)([!?]+)$/\n"],
  ])("%s", (_label, source) => {
    expect(hasRegex(source)).toBe(true);
  });
});
