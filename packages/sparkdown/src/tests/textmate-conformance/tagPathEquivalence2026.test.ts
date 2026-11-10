import { vscodeLanguage } from "@impower/codemirror-vscode-language/src/extensions/vscodeLanguage";
import { parseTag } from "@impower/codemirror-vscode-language/src/utils/parseTag";
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
  "*",
  "100%",
  "a%23b",
  "a%25b",
  "x#y%",
];

const WILD = null;

const unicode = (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`;
const bare = (name: string) => (name !== "*" && /^[^"/!\s]+$/.test(name) ? name : JSON.stringify(name));
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
    const shapes: (string | null)[][] = [
      [`${inner}_content`],
      [inner, `${inner}_content`],
      [`${outer}_content`, inner, `${inner}_content`],
      [outer, `${outer}_content`, inner, `${inner}_content`],
      [WILD, `${inner}_content`],
      [outer, WILD, inner, `${inner}_content`],
    ];
    shapes.forEach((shape, s) => {
      for (let offset = 0; offset < ENCODINGS.length; offset++) {
        const path = shape
          .map((name, j) => (name === WILD ? "*" : ENCODINGS[(i + s + j + offset) % ENCODINGS.length]!(name)))
          .join("/");
        all.push({
          label: `${inner} in ${outer}, shape ${s}, encoding ${offset}`,
          outer,
          inner,
          tag: `(${path}/) keyword`,
          highlights: !/\s/.test(path),
        });
      }
      const escapedPath = shape.map((name) => (name === WILD ? "*" : whitespaceEscaped(name))).join("/");
      all.push({
        label: `${inner} in ${outer}, shape ${s}, every name escaped`,
        outer,
        inner,
        tag: `(${escapedPath}/) keyword`,
        highlights: true,
      });
    });
    const last = bare(`${inner}_content`);
    for (const modifier of [`${last}/...`, `${last}/!`, "...", "!", "*/", "*/...", `*/${last}/...`]) {
      all.push({ label: `${inner} with modifier ${modifier}`, outer, inner, tag: `(${modifier}) keyword`, highlights: !/\s/.test(modifier) });
    }
    for (const modifier of [`${last}!`, `/${last}/`, `${last}//`]) {
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
    for (const name of ["100%", "a%23b", "a%25b", "x#y%"]) {
      expect(valid.filter((c) => c.tag.includes(name)).length, name).toBeGreaterThan(5);
    }
    expect(valid.filter((c) => c.tag.includes('"*"/')).length).toBeGreaterThan(5);
    expect(valid.filter((c) => /[(/]\*\//.test(c.tag)).length).toBeGreaterThan(5);
    for (const suffix of ["/...)", "!)"]) {
      expect(valid.filter((c) => c.tag.endsWith(`${suffix} keyword`)).length, suffix).toBeGreaterThan(5);
    }
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

  test.each([
    ["keyword", "Leaf/..."],
    ["(Block_content/) keyword", "Block_content/Leaf/..."],
    ["(Block_content/...) keyword", "Block_content/Leaf/..."],
    ["(Block_content/!) keyword", "Block_content/Leaf!"],
    ["(...) keyword", "Leaf/..."],
    ["(!) keyword", "Leaf!"],
    ["(*/...) keyword", "*/Leaf/..."],
  ])("%s selects %s", (tag, selector) => {
    expect(Object.keys(parseTag("Leaf", tag))).toEqual([selector]);
  });

  const modes = (tag: string) => ({
    name: "guest",
    scopeName: "source.guest",
    patterns: [{ include: "#Block" }],
    repository: {
      Block: { begin: "<", end: ">", patterns: [{ include: "#Leaf" }] },
      Leaf: { begin: "\\[", end: "\\]", tag, patterns: [{ include: "#Word" }] },
      Word: { match: "[a-z]+", tag: "string" },
    },
  });

  const modeOutcome = (grammar: Parameters<typeof vscodeLanguage>[0]["grammar"]) => {
    const text = "<[word]>";
    const tree = vscodeLanguage({ name: "x", grammar }).language.parser.parse(text);
    const spans: string[] = [];
    highlightTree(tree, modeHighlighter, (from, to, classes) => spans.push(`${text.slice(from, to)}:${classes}`));
    return spans;
  };

  test.each([
    ["keyword", ["[:kw", "word:kw str", "]:kw"]],
    ["(Block_content/) keyword", ["[:kw", "word:kw str", "]:kw"]],
    ["(Block_content/...) keyword", ["[:kw", "word:kw str", "]:kw"]],
    ["(Block_content/!) keyword", ["[word]:kw"]],
    ["(!) keyword", ["[word]:kw"]],
  ])("%s highlights the tagged node and what it holds, unless it ends in !, alone and embedded", (tag, spans) => {
    expect(modeOutcome(modes(tag))).toEqual(spans);
    expect(modeOutcome(new GrammarRegistry([HOST, modes(tag)]))).toEqual(spans);
  });

  test.each([
    ["a tag function used as a tag", "definition", /definition is a tag function, not a tag/],
    ["a tag used as a tag function", "keyword(variableName)", /keyword is a tag, not a tag function/],
    ["an unknown tag", "(Block_content/) notATag", /Unknown tag: notATag/],
    ["an inherited property", "toString", /Unknown tag: toString/],
  ])("%s is refused alone and embedded with the same error", (_, tag, error) => {
    const alone = outcome(guest("Block", "Leaf", tag));
    expect(alone[0]).toMatch(error);
    expect(outcome(new GrammarRegistry([HOST, guest("Block", "Leaf", tag)]))).toEqual(alone);
  });
});

const modeHighlighter = tagHighlighter([
  { tag: tags.keyword, class: "kw" },
  { tag: tags.string, class: "str" },
]);
