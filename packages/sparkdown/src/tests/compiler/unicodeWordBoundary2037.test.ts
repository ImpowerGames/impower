import { RegExpMatcher } from "@impower/textmate-grammar-tree/src/grammar/classes/RegExpMatcher";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import onig from "vscode-oniguruma";
import { beforeAll, describe, expect, test } from "vitest";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

const { OnigScanner, OnigString, loadWASM } = onig;

const SAMPLES = [
  "a",
  "Z",
  "0",
  "9",
  "_",
  " ",
  "-",
  ".",
  "\t",
  "名",
  "é",
  "ж",
  "\u{301}",
  "\u{663}",
  "\u{ff11}",
  "\u{b2}",
  "\u{bd}",
  "\u{aa}",
  "\u{203f}",
  "\u{2160}",
  "\u{a0}",
  "\u{897}",
  "\u{1d49c}",
  "\u{1f600}",
  "\u{1d7ce}",
  "\u{1e4d0}",
  "\u{11f02}",
  "\u{85}",
  "\u{feff}",
  "\u{3000}",
];

const PATTERNS = [
  "\\w",
  "\\W",
  "\\d",
  "\\D",
  "[\\w]",
  "[\\W]",
  "[\\d]",
  "[\\D]",
  "[^\\w]",
  "[^\\W]",
  "[^\\d]",
  "[\\w-]",
  "[\\W-]",
  "\\s",
  "\\S",
  "[\\s]",
  "[\\S]",
  "[^\\S\\n\\r]",
  "a\\b",
  "a\\B",
  "\\ba",
  "\\Ba",
  "(?:a)\\b",
  "(?:a)\\B",
  "\\b(?:a)",
  "\\B(?:a)",
  "\\ta\\b",
  "\\x61\\b",
  "(?:a|b)\\b",
  "(a|b)\\B",
  "\\b(?:b|a)",
  "\\B(b|a)",
  "a(?<=a)\\b",
];

const onigMatch = (pattern: string, text: string, pos = 0) => {
  const scanner = new OnigScanner([pattern]);
  const string = new OnigString(text);
  const match = scanner.findNextMatchSync(string, pos);
  if (!match || match.captureIndices[0]!.start !== pos) return null;
  return text.slice(pos, match.captureIndices[0]!.end);
};

const treeMatch = (pattern: string, text: string, pos = 0, flags = "muy") =>
  new RegExpMatcher(pattern, flags).match(text, pos)?.[0] ?? null;

const cases = (pattern: string): [string, number][] =>
  SAMPLES.map((sample) => {
    if (pattern.startsWith("\\t")) return [`\ta${sample}`, 0];
    if (/^(?:\((?:\?:)?)?a|^\\x61/.test(pattern)) return [`a${sample}`, 0];
    if (/a\)?$/.test(pattern)) return [`${sample}a`, sample.length];
    return [sample, 0];
  });

beforeAll(async () => {
  await loadWASM(readFileSync(createRequire(import.meta.url).resolve("vscode-oniguruma/release/onig.wasm")));
});

describe("word, digit and space escapes read Unicode text as Oniguruma does (I-2037)", () => {
  test.each(PATTERNS)("%s", (pattern) => {
    const texts = cases(pattern);
    expect(texts.map(([text, pos]) => treeMatch(pattern, text, pos))).toEqual(
      texts.map(([text, pos]) => onigMatch(pattern, text, pos)),
    );
  });

  test.each(["\\w", "[\\w]", "\\d", "\\s"])("%s agrees with Oniguruma at every code point", (pattern) => {
    const scanner = new OnigScanner([pattern]);
    const matcher = new RegExpMatcher(pattern, "muy");
    const disagreements: string[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp++) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const text = String.fromCodePoint(cp);
      const onigMatched = scanner.findNextMatchSync(new OnigString(text), 0) != null;
      const treeMatched = matcher.match(text, 0) != null;
      if (onigMatched !== treeMatched) disagreements.push(cp.toString(16));
    }
    expect(disagreements.slice(0, 20)).toEqual([]);
  });

  test("an escaped backslash before a letter stays a literal backslash", () => {
    expect(treeMatch("\\\\b", "\\b")).toBe("\\b");
    expect(treeMatch("\\\\w", "\\w")).toBe("\\w");
  });

  test("a boundary sees the character before the match position", () => {
    const matcher = new RegExpMatcher("\\bx", "muy");
    expect(matcher.match("名x", 1)).toBeNull();
    expect(matcher.match(" x", 1)).toEqual(["x"]);
  });

  test("a back-reference array changed in place reaches the Unicode reading", () => {
    const matcher = new RegExpMatcher("\\1\\b", "muy");
    const captures = ["", "do"];
    matcher.backReferences = captures;
    expect(matcher.match("do é", 0)).toEqual(["do"]);
    expect(matcher.match("do名", 0)).toBeNull();
    captures[1] = "end";
    matcher.backReferences = captures;
    expect(matcher.match("end é", 0)).toEqual(["end"]);
    expect(matcher.match("end名", 0)).toBeNull();
  });

  test("an escape inside a nested class reads the class word set", () => {
    expect(treeMatch("[[\\w]\\w]", "\u{b2}", 0, "mvy")).toBe(onigMatch("[[\\w]\\w]", "\u{b2}"));
    expect(treeMatch("[[\\w]\\w]", "名", 0, "mvy")).toBe(onigMatch("[[\\w]\\w]", "名"));
  });
});

describe("a keyword glued to non-ASCII text reads the same in both engines (I-2037)", () => {
  test.each([
    "function名 text\nHello\n",
    "local名 x = 1\n",
    "function\u{897} text\nHello\n",
    "function\u{1e4d0} text\nHello\n",
    "function f()\n  return 1\nend\n",
  ])("%j", async (source) => {
    const { divergences } = await compareEnginesFull(source);
    expect(divergences, formatDivergences(source, divergences)).toEqual([]);
  });

  test.each([
    ["if x == 1 then名\n", "then名"],
    ["while x < 3 do名\n", "do名"],
  ])("%j does not end its header at the glued keyword", async (source, glued) => {
    const { divergences } = await compareEnginesFull(source);
    const keyword = source.indexOf(glued);
    expect(divergences.filter((d) => d.offset < keyword), formatDivergences(source, divergences)).toEqual([]);
    expect(divergences.flatMap((d) => d.tree).filter((scope) => scope.startsWith("keyword.control"))).toEqual([]);
  });
});
