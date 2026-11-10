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
  "tab\there",
  "source.guest#Block",
];

const unicode = (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
const bare = (name: string) => (/^[^"/!\s]+$/.test(name) ? name : JSON.stringify(name));
const quoted = (name: string) => JSON.stringify(name);
const escaped = (name: string) => `"${unicode(name)}${JSON.stringify(name).slice(2)}`;
const whitespaceEscaped = (name: string) => JSON.stringify(name).replace(/\s/g, unicode);
const ENCODINGS = [bare, quoted, escaped, whitespaceEscaped];

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
    return [`throws ${(error as Error).message}`];
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
    shapes.forEach((shape, s) => {
      for (let offset = 0; offset < ENCODINGS.length; offset++) {
        const path = shape
          .map((name, j) => (name === "*" ? name : ENCODINGS[(i + s + j + offset) % ENCODINGS.length]!(name)))
          .join("/");
        all.push({
          label: `${inner} in ${outer}, shape ${s}, encoding ${offset}`,
          outer,
          inner,
          tag: `(${path}/) keyword`,
          highlights: !/\s/.test(path),
        });
      }
      const escapedPath = shape.map((name) => (name === "*" ? name : whitespaceEscaped(name))).join("/");
      all.push({
        label: `${inner} in ${outer}, shape ${s}, every name escaped`,
        outer,
        inner,
        tag: `(${escapedPath}/) keyword`,
        highlights: true,
      });
    });
    const last = bare(`${inner}_content`);
    for (const modifier of [`${last}/...`, `${last}!`, `${last}/!`, `/${last}/`, `${last}//`, "...", "*/"]) {
      all.push({ label: `${inner} with modifier ${modifier}`, outer, inner, tag: `(${modifier}) keyword`, highlights: false });
    }
  });
  return all;
};

describe("a tag's parent path reads the same in an embedded grammar as alone (I-2026)", () => {
  test("the generated cases include escaped whitespace and names that begin with the namespace", () => {
    const valid = cases().filter((c) => c.highlights);
    expect(valid.filter((c) => /\\u0020/.test(c.tag)).length).toBeGreaterThan(5);
    expect(valid.filter((c) => /\\t|\\u0009/.test(c.tag)).length).toBeGreaterThan(5);
    expect(valid.filter((c) => c.tag.includes("source.guest#Block")).length).toBeGreaterThan(5);
  });

  test.each(cases().map((c) => [c.label, c] as const))("%s", (_, c) => {
    const alone = outcome(guest(c.outer, c.inner, c.tag));
    if (c.highlights) {
      expect(alone, `${c.tag} alone`).toEqual(["word:kw"]);
    }
    const embedded = outcome(new GrammarRegistry([HOST, guest(c.outer, c.inner, c.tag)]));
    expect(embedded, `${c.tag} embedded`).toEqual(alone);
  });

  test.each([
    ["an empty name between slashes", "(Block_content//Leaf_content/) keyword"],
    ["a leading slash", "(/Block_content/) keyword"],
    ["a ! glued to a name", "(Block_content!/) keyword"],
    ["a name or a name followed by ...", "(Block_content...) keyword"],
    ["an unterminated quoted name", '("Block_content/) keyword'],
    ["text after a quoted name", '("Block"_content/) keyword'],
    ["a quoted name that is not a JSON string", '("Block\\q"/) keyword'],
  ])("%s is refused alone and embedded with the same error", (_, tag) => {
    const alone = outcome(guest("Block", "Leaf", tag));
    expect(alone[0]).toMatch(/^throws Invalid tag modifier in /);
    expect(outcome(new GrammarRegistry([HOST, guest("Block", "Leaf", tag)]))).toEqual(alone);
  });
});
