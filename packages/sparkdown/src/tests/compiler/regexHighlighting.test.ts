import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

function nodeNames(source: string): string[] {
  return stripAnsi(dumpTree(source))
    .split("\n")
    .map((l) => l.match(/([A-Za-z_]+)(?: \[|\s+\d)/)?.[1] ?? "")
    .filter(Boolean);
}

const literal = (re: string) =>
  nodeNames(`define t as typewriter with\n  voiced = ${re}\nend\n`);

describe("regex literal internals are tokenized", () => {
  test("the whole literal is still a regex literal", () => {
    expect(literal(String.raw`@/a/u`)).toContain("LuauRegexLiteral");
  });

  test("character classes, anchors and quantifiers are distinct nodes", () => {
    const names = literal(String.raw`@/^([\p{Lu}]{2,}[^\p{Ll}]*)$/u`);
    expect(names).toContain("LuauRegexAnchor");
    expect(names).toContain("LuauRegexCharacterClass");
    expect(names).toContain("LuauRegexEscapedCharacterClass");
    expect(names).toContain("LuauRegexQuantifier");
    expect(names).toContain("LuauRegexGroupBegin");
    expect(names).toContain("LuauRegexGroupEnd");
  });

  test("alternation is its own node", () => {
    expect(literal(String.raw`@/cat|dog/`)).toContain("LuauRegexAlternation");
  });

  test("a non-capturing group and a lookahead are groups", () => {
    const names = literal(String.raw`@/(?:ab)(?=c)(?<!d)/`);
    expect(names.filter((n) => n === "LuauRegexGroupBegin").length).toBe(3);
  });

  test("`\\$` is an escape, NOT an anchor", () => {
    const names = literal(String.raw`@/\$5/`);
    expect(names).toContain("LuauRegexEscape");
    expect(names).not.toContain("LuauRegexAnchor");
  });

  test("a bare `$` at the end IS an anchor", () => {
    expect(literal(String.raw`@/x$/`)).toContain("LuauRegexAnchor");
  });

  test("a shorthand class inside `[...]` is still a shorthand class", () => {
    const names = literal(String.raw`@/[\p{Lu}\d]/u`);
    expect(names).toContain("LuauRegexCharacterClass");
    expect(names).toContain("LuauRegexEscapedCharacterClass");
  });

  test("literal text between constructs is not lost", () => {
    const names = literal(String.raw`@/ab(cd)ef/`);
    expect(names).toContain("LuauRegexText");
  });
});
