import { vscodeLanguage } from "@impower/codemirror-vscode-language/src/extensions/vscodeLanguage";
import { GrammarRegistry } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarRegistry";
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { describe, expect, test } from "vitest";

const NAMES = [
  "Plain",
  "dot.name",
  "with/slash",
  "with!bang",
  "with)paren",
  "with(paren",
  "a(b)c",
  "back\\slash",
  'quote"d',
  "dots...",
  "star*",
  "café",
  "has#hash",
  "with space",
];

const bare = (name: string) => (/^[^"/!\s]+$/.test(name) ? name : JSON.stringify(name));
const quoted = (name: string) => JSON.stringify(name);
const escaped = (name: string) => `"\\u${name.charCodeAt(0).toString(16).padStart(4, "0")}${JSON.stringify(name).slice(2)}`;
const ENCODINGS = [bare, quoted, escaped];

const guest = (outer: string, inner: string, tag: string) => ({
  name: "guest",
  scopeName: "source.guest",
  patterns: [{ include: `#${outer}` }],
  repository: {
    [outer]: { begin: "<", end: ">", patterns: [{ include: `#${inner}` }] },
    [inner]: { begin: "\\[", end: "\\]", patterns: [{ include: "#Leaf" }] },
    Leaf: { match: "[a-z]+", tag },
  },
});

const HOST = { name: "host", scopeName: "source.host", patterns: [{ include: "source.guest" }] };

const highlighter = tagHighlighter([{ tag: tags.keyword, class: "kw" }]);

const outcome = (grammar: Parameters<typeof vscodeLanguage>[0]["grammar"]) => {
  const text = "<[word]>";
  try {
    const tree = vscodeLanguage({ name: "x", grammar }).language.parser.parse(text);
    const spans: string[] = [];
    highlightTree(tree, highlighter, (from, to, classes) => spans.push(`${text.slice(from, to)}:${classes}`));
    return spans;
  } catch (error) {
    return [`throws ${(error as Error).name}`];
  }
};

interface Case {
  label: string;
  outer: string;
  inner: string;
  tag: string;
  highlights: boolean;
}

const cases = (): Case[] => {
  const all: Case[] = [];
  NAMES.forEach((inner, i) => {
    const outer = NAMES[(i + 5) % NAMES.length]!;
    const shapes: string[][] = [
      [`${inner}_content`],
      [inner, `${inner}_content`],
      [`${outer}_content`, inner, `${inner}_content`],
      [outer, `${outer}_content`, inner, `${inner}_content`],
      ["*", `${inner}_content`],
      [outer, "*", inner, `${inner}_content`],
    ];
    const valid = !/\s/.test(inner) && !/\s/.test(outer);
    shapes.forEach((shape, s) => {
      const path = shape
        .map((name, j) => (name === "*" ? name : ENCODINGS[(i + s + j) % ENCODINGS.length]!(name)))
        .join("/");
      all.push({ label: `${inner} in ${outer}, shape ${s}`, outer, inner, tag: `(${path}/) keyword`, highlights: valid });
    });
    const last = bare(`${inner}_content`);
    for (const modifier of [`${last}/...`, `${last}!`, `${last}/!`, `/${last}/`, `${last}//`, "...", "*/"]) {
      all.push({ label: `${inner} with modifier ${modifier}`, outer, inner, tag: `(${modifier}) keyword`, highlights: false });
    }
  });
  return all;
};

describe("a tag's parent path reads the same in an embedded grammar as alone (I-2026)", () => {
  test.each(cases().map((c) => [c.label, c] as const))("%s", (_, c) => {
    const alone = outcome(guest(c.outer, c.inner, c.tag));
    if (c.highlights) {
      expect(alone, `${c.tag} alone`).toEqual(["word:kw"]);
    }
    const embedded = outcome(new GrammarRegistry([HOST, guest(c.outer, c.inner, c.tag)]));
    expect(embedded, `${c.tag} embedded`).toEqual(alone);
  });
});
