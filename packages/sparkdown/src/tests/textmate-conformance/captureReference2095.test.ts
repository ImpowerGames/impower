import { defineNodeTypeWithLanguageNodeProps } from "@impower/codemirror-vscode-language/src/utils/defineNodeTypeWithLanguageNodeProps";
import { Compiler } from "@impower/textmate-grammar-tree/src/compiler/classes/Compiler";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { createLanguageReader } from "@impower/textmate-grammar-tree/src/tree/utils/createLanguageReader";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { describe, expect, test } from "vitest";
import { scopesOf, treeScopes, vscodeScopes } from "./engineScopes";

const ROOT = [{ include: "#R" }, { include: "#Word" }, { include: "#Gap" }];

const grammarOf = (
  rule: Record<string, unknown>,
  patterns: unknown[] = ROOT,
  repository: Record<string, unknown> = {},
) => ({
  name: "mini",
  scopeName: "source.mini",
  patterns,
  repository: {
    Word: { name: "word.mini", match: "[A-Za-z0-9]+" },
    Gap: { match: "\\s" },
    R: rule,
    ...repository,
  },
});

const INNER = [{ include: "#Word" }, { include: "#Gap" }];

const GRAMMARS = {
  matchNameFromItsOwnMatch: grammarOf({ match: "<([a-z]+)>", name: "m.$0.$1.mini" }),
  matchNameCaseCommands: grammarOf({ match: "<([a-zA-Z]+)>", name: "m.${1:/downcase}.${1:/upcase}.mini" }),
  matchNameHoldingTwoScopes: grammarOf({ match: "\\b(?i:function)\\b", name: "storage.type.$0 keyword.declaration.$0" }),
  captureNameFromTheEnclosingMatch: grammarOf({
    match: "<([a-z]+):([a-z]+)>",
    captures: { "1": { name: "c1.$2.mini" }, "2": { name: "c2.$1.mini" } },
  }),
  captureZeroAndRuleName: grammarOf({
    match: "<([a-z]+)>",
    name: "m.$1.mini",
    captures: { "0": { name: "c0.$1.mini" }, "1": { name: "c1.$0.mini" } },
  }),
  captureWithPatterns: grammarOf({
    match: "<([a-z]+):([a-z ]+)>",
    captures: { "2": { name: "c2.$1.mini", patterns: INNER } },
  }),
  beginEndNameAndContentNameFromBeginCaptures: grammarOf({
    begin: "<([a-z]+):",
    end: ">",
    name: "block.$1.mini",
    contentName: "content.$1.$0.mini",
    patterns: INNER,
  }),
  contentNameCaseCommands: grammarOf({
    begin: "<([a-zA-Z]+):",
    end: ">",
    contentName: "content.${1:/upcase}.${1:/downcase}.mini",
    patterns: INNER,
  }),
  beginAndEndCaptures: grammarOf({
    begin: "<([a-z]+):",
    end: "([a-z]*)>",
    name: "block.$1.mini",
    beginCaptures: { "1": { name: "open.$1.$0.mini" } },
    endCaptures: { "0": { name: "close.$1.mini" }, "1": { name: "tail.$1.mini" } },
  }),
  nestedOccurrences: grammarOf({
    begin: "<([a-z]+):",
    end: ">",
    contentName: "content.$1.mini",
    patterns: [{ include: "#R" }, ...INNER],
  }),
  nonParticipatingGroupIsEmpty: grammarOf({ match: "<(?:([a-z]+)|([0-9]+))>", name: "m.$1.$2.$5.mini" }),
  nonParticipatingGroupInContentName: grammarOf({
    begin: "<(?:([a-z]+)|([0-9]+)):",
    end: ">",
    contentName: "content.$1.$2.mini",
    patterns: INNER,
  }),
  leadingDotsStripped: grammarOf({ match: "<([a-z.]+)>", name: "m.$1.mini" }),
  spaceInCapturedText: grammarOf({ match: "<([a-z ]+)>", name: "m.$1.mini" }),
  spaceInContentName: grammarOf({
    begin: "<([a-z ]+):",
    end: ">",
    contentName: "content.$1",
    patterns: INNER,
  }),
  literalForms: grammarOf({ match: "<([a-z]+)>", name: "m.$x.${1}.${1:/other}.$$1" }),
  multiDigitReference: grammarOf({ match: "(a)(b)(c)(d)(e)(f)(g)(h)(i)(j)(k)", name: "m.$11.$10.$1" }),
  endBackReference: grammarOf({
    begin: "<([a-z]+)>",
    end: "</(\\1)>",
    contentName: "content.$1.mini",
    patterns: INNER,
  }),
  nameExpandingToEmpty: grammarOf({ match: "<([a-z]*)>", name: "$1" }),
  contentNameExpandingToEmpty: grammarOf({
    begin: "<([a-z]*):",
    end: ">",
    name: "$1",
    contentName: "$1",
    patterns: INNER,
  }),
  zeroLengthCaptureExpanded: grammarOf({ match: "<([a-z]*)>", captures: { "1": { name: "$1" } } }),
  staticEmptyName: grammarOf({ match: "<([a-z]*)>", name: "" }),
  staticNameWithRepeatedSpaces: grammarOf({ match: "<([a-z]*)>", name: " a  b " }),
  expandedNameWithRepeatedSpaces: grammarOf({ match: "<([a-z ]*)>", name: "x$1y" }),
};

describe("capture references in scope names expand per occurrence, as vscode-textmate does (#2095)", () => {
  test("a begin/end rule's contentName expands from its begin captures", async () => {
    const grammar = GRAMMARS.beginEndNameAndContentNameFromBeginCaptures;
    const text = "<red:ab> <blue:cd>\n";
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(vscode[text.indexOf("ab")]).toBe("source.mini block.red.mini content.red.<red:.mini word.mini");
    expect(vscode[text.indexOf("cd")]).toBe("source.mini block.blue.mini content.blue.<blue:.mini word.mini");
    expect(treeScopes(grammar, text)).toEqual(vscode);
  });

  const CASES: [keyof typeof GRAMMARS, string][] = [
    ["matchNameFromItsOwnMatch", "<ab> <cd> <ab>\n"],
    ["matchNameCaseCommands", "<aB> <Cd>\n"],
    ["matchNameHoldingTwoScopes", "Function function\n"],
    ["captureNameFromTheEnclosingMatch", "<ab:cd> <ef:gh>\n"],
    ["captureZeroAndRuleName", "<ab> <cd>\n"],
    ["captureWithPatterns", "<ab:cd ef> <gh:ij>\n"],
    ["beginEndNameAndContentNameFromBeginCaptures", "<red:ab> <blue:cd\nef> <red:gh>\n"],
    ["beginEndNameAndContentNameFromBeginCaptures", "<red:ab\n"],
    ["contentNameCaseCommands", "<Red:ab> <bLuE:cd>\n"],
    ["beginAndEndCaptures", "<red:ab> <blue:>\n"],
    ["nestedOccurrences", "<red:a <blue:b> c>\n"],
    ["nonParticipatingGroupIsEmpty", "<ab> <12>\n"],
    ["nonParticipatingGroupInContentName", "<12:ab> <cd:ef>\n"],
    ["leadingDotsStripped", "<..a.b> <a.> <.>\n"],
    ["spaceInCapturedText", "<a b> <c>\n"],
    ["spaceInContentName", "<a b:cd>\n"],
    ["literalForms", "<ab>\n"],
    ["multiDigitReference", "abcdefghijk\n"],
    ["endBackReference", "<ab>x</ab> <cd>y\nz</cd>\n"],
    ["nameExpandingToEmpty", "<> <ab>\n"],
    ["contentNameExpandingToEmpty", "<:x> <ab:y>\n"],
    ["zeroLengthCaptureExpanded", "<> <a>\n"],
    ["staticEmptyName", "<a>\n"],
    ["staticNameWithRepeatedSpaces", "<a>\n"],
    ["expandedNameWithRepeatedSpaces", "< a  b >\n"],
  ];

  test.each(CASES)("%s grammar on %j matches vscode-textmate", async (grammar, text) => {
    expect(treeScopes(GRAMMARS[grammar], text)).toEqual(await vscodeScopes(structuredClone(GRAMMARS[grammar]), text));
  });

  test("an expansion to the empty string is an empty scope, as in vscode-textmate", async () => {
    const text = "<:x>\n";
    const vscode = await vscodeScopes(structuredClone(GRAMMARS.contentNameExpandingToEmpty), text);
    expect(vscode[text.indexOf("x")]).toBe("source.mini   word.mini");
    expect(treeScopes(GRAMMARS.contentNameExpandingToEmpty, text)).toEqual(vscode);
  });
});

const EMBEDDED = grammarOf({
  match: "<([a-z. ]+)>",
  name: "meta.embedded.$1",
  captures: { "1": { name: "x.$1" } },
});

const lineOf = (text: string, word: string) => text.indexOf(word);

describe("a derived node type means the same occurrence wherever a tree is read (#2095)", () => {
  test("a language reader made from a second parser reads the first parser's tree by its own types", () => {
    const first = new TextmateGrammarParser(structuredClone(EMBEDDED) as never);
    const second = new TextmateGrammarParser(structuredClone(EMBEDDED) as never);
    second.parse("<css> <lua>\n");
    const text = "<lua> <css>\n";
    const tree = first.parse(text);
    const reader = createLanguageReader(second.grammar, {
      "meta.embedded.lua": "lua",
      "meta.embedded.css": "css",
    });
    expect(reader.character(tree, lineOf(text, "lua"), "mini")).toBe("lua");
    expect(reader.character(tree, lineOf(text, "css"), "mini")).toBe("css");
    expect(reader.character(tree, lineOf(text, " "), "mini")).toBe("mini");
  });

  test("fragments of the first parser's tree give the second parser its own cold parse", async () => {
    const grammar = GRAMMARS.beginEndNameAndContentNameFromBeginCaptures;
    const first = new TextmateGrammarParser(structuredClone(grammar) as never);
    const second = new TextmateGrammarParser(structuredClone(grammar) as never);
    second.parse("<gold:x>\n<blue:y>\n");
    const before = "<red:ab>\n<blue:cd\nef>\n";
    const tree = first.parse(before);
    const at = before.indexOf("cd");
    const text = `${before.slice(0, at)}z${before.slice(at)}`;
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(tree), [
      { fromA: at, toA: at, fromB: at, toB: at + 1 },
    ]);
    const reused = second.parse(text, fragments);
    const cold = second.parse(text);
    expect(printTree(reused, text)).toBe(printTree(cold, text));
    expect(scopesOf(second, reused, text)).toEqual(scopesOf(second, cold, text));
    expect(scopesOf(second, reused, text)).toEqual(await vscodeScopes(structuredClone(grammar), text));
  });
});

describe("the node set grows in place and a type added after the first parse highlights like its base (#2095)", () => {
  const HIGHLIGHTED = grammarOf({ match: "<([a-z]+)>", name: "m.$1.mini", tag: "keyword" });
  const highlighter = tagHighlighter([{ tag: tags.keyword, class: "kw" }]);
  const highlighted = (tree: Tree) => {
    const ranges: string[] = [];
    highlightTree(tree, highlighter, (from, to, classes) => ranges.push(`${from}-${to}:${classes}`));
    return ranges;
  };

  test("the second parse's new expansion is highlighted and the first tree still reads", () => {
    const parser = new TextmateGrammarParser(
      structuredClone(HIGHLIGHTED) as never,
      undefined,
      defineNodeTypeWithLanguageNodeProps,
    );
    const types = parser.nodeSet.types;
    const loaded = types.length;
    const firstText = "<ab>\n";
    const first = parser.parse(firstText);
    expect(parser.nodeSet.types).toBe(types);
    expect(types.length).toBe(loaded + 1);
    const text = "<ab> <cd>\n";
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(first), [
      { fromA: 4, toA: 4, fromB: 4, toB: 9 },
    ]);
    const second = parser.parse(text, fragments);
    expect(types.length).toBe(loaded + 2);
    types.forEach((type, i) => expect(type.id).toBe(i));
    expect(types[loaded + 1]!.name).toBe(types[loaded]!.name);
    expect(highlighted(second)).toEqual(["0-4:kw", "5-9:kw"]);
    expect(highlighted(first)).toEqual(["0-4:kw"]);
    expect(scopesOf(parser, second, text)[6]).toBe("source.mini m.cd.mini");
    expect(scopesOf(parser, first, firstText)[1]).toBe("source.mini m.ab.mini");
  });
});

describe("past the node type limit an occurrence keeps its base type, a known difference from vscode-textmate (#2095)", () => {
  test("the expansion that would exceed the limit falls back to the literal scope", async () => {
    const grammar = GRAMMARS.matchNameFromItsOwnMatch;
    const parser = new TextmateGrammarParser(structuredClone(grammar) as never);
    parser.grammar.typeLimit = parser.nodeSet.types.length + 1;
    const text = "<ab> <cd> <ab>\n";
    const scopes = scopesOf(parser, parser.parse(text), text);
    expect(parser.nodeSet.types.length).toBe(parser.grammar.typeLimit);
    expect(scopes[1]).toBe("source.mini m.<ab>.ab.mini");
    expect(scopes[6]).toBe("source.mini m.$0.$1.mini");
    expect(scopes[11]).toBe("source.mini m.<ab>.ab.mini");
    expect((await vscodeScopes(structuredClone(grammar), text))[6]).toBe("source.mini m.<cd>.cd.mini");
  });

  test("the default limit is Lezer's largest node type id plus one", () => {
    expect(new TextmateGrammarParser(structuredClone(GRAMMARS.matchNameFromItsOwnMatch) as never).grammar.typeLimit).toBe(0x10000);
  });
});

describe("a scope name holding a space is two scopes to the language reader, static or expanded (#2095)", () => {
  const STATIC = grammarOf({ match: "<([a-z]+)>", name: "x.mini meta.embedded.lua" });
  const EXPANDED = grammarOf({ match: "<([a-z. ]+)>", name: "x.$1" });
  const languages = { "meta.embedded.lua": "lua" };

  test.each([
    ["static", STATIC, "<ab>\n"],
    ["expanded", EXPANDED, "<mini meta.embedded.lua>\n"],
  ])("%s", (_, grammar, text) => {
    const parser = new TextmateGrammarParser(structuredClone(grammar) as never);
    const tree = parser.parse(text);
    const reader = createLanguageReader(parser.grammar, languages);
    expect(reader.character(tree, 1, "mini")).toBe("lua");
    expect(reader.character(tree, text.length - 1, "mini")).toBe("mini");
  });
});

const compilerOf = (tree: Tree): any =>
  Object.values((tree as any).props as Record<string, unknown>).find((v) => v instanceof Compiler);

const cachedRuns = (tree: Tree): unknown[] =>
  (compilerOf(tree)?.packet?.chunks ?? []).flatMap((chunk: any) => (chunk.run ? [chunk.run.reused] : []));

describe("an incremental parse equals a cold parse when captured text is edited (#2095)", () => {
  const BLOCK = grammarOf(
    {
      begin: "<(?:([a-z]+)|([0-9]+)):",
      end: ">",
      name: "block.$1.$2.mini",
      contentName: "content.$1.$2.mini",
      patterns: [{ include: "#Inner" }, ...INNER],
    },
    ROOT,
    { Inner: { match: "\\[([a-z0-9]+)\\]", name: "inner.$1.mini" } },
  );

  const edit = (parser: TextmateGrammarParser, before: Tree, text: string, at: number, insert: string, remove: number) => {
    const next = `${text.slice(0, at)}${insert}${text.slice(at + remove)}`;
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [
      { fromA: at, toA: at + remove, fromB: at, toB: at + insert.length },
    ]);
    return { next, tree: parser.parse(next, fragments) };
  };

  const same = (parser: TextmateGrammarParser, tree: Tree, text: string) => {
    const cold = new TextmateGrammarParser(structuredClone(BLOCK) as never);
    expect(printTree(tree, text)).toBe(printTree(parser.parse(text), text));
    expect(scopesOf(parser, tree, text)).toEqual(scopesOf(parser, parser.parse(text), text));
    expect(scopesOf(parser, tree, text)).toEqual(scopesOf(cold, cold.parse(text), text));
  };

  test("inside a cached run, after the run is reused, and when the participating capture changes", async () => {
    const parser = new TextmateGrammarParser(structuredClone(BLOCK) as never);
    let text = `x\n<red:\n${"ab [cd] ef\n".repeat(400)}>\ntail [gh]\n`;
    let tree = parser.parse(text);
    const tail = () => text.length - 3;
    const capture = () => text.indexOf("<") + 1;
    const steps: [string, () => number, string, number][] = [
      ["after the block", tail, "z", 0],
      ["before the block", () => 1, "q", 0],
      ["the captured text", () => capture() + 1, "o", 1],
      ["after the block once the captured text changed", tail, "w", 0],
      ["the captured text to digits, so the other capture participates", capture, "12", 3],
      ["after the block with digits", tail, "v", 0],
      ["inside the block", () => text.indexOf("ef") + 1, "u", 0],
      ["the captured text back to letters", capture, "abc", 2],
      ["after the block with letters again", tail, "t", 0],
      ["an inner capture", () => text.indexOf("[cd]") + 1, "k", 1],
    ];
    const reusedAt: string[] = [];
    for (const [label, at, insert, remove] of steps) {
      const runsBefore = cachedRuns(tree);
      ({ next: text, tree } = edit(parser, tree, text, at(), insert, remove));
      if (cachedRuns(tree).some((run) => runsBefore.includes(run))) reusedAt.push(label);
      same(parser, tree, text);
    }
    expect(reusedAt).toEqual(
      expect.arrayContaining([
        "after the block once the captured text changed",
        "after the block with digits",
        "after the block with letters again",
      ]),
    );
    expect(reusedAt).not.toContain("the captured text");
    expect(text).toContain("<abc:");
    expect(scopesOf(parser, tree, text)).toEqual(await vscodeScopes(structuredClone(BLOCK), text));
  });

  const random = (seed: number) => () => {
    seed = (Math.imul(seed, 1103515245) + 12345) | 0;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };

  test.each([1, 2, 3, 4])("random edit chain, seed %i", (seed) => {
    const parser = new TextmateGrammarParser(structuredClone(BLOCK) as never);
    const ALPHABET = ["a", "1", "<", ">", ":", "[", "]", " ", "\n", ""];
    const rand = random(seed);
    let text = "<red:ab [cd]\nef> <12:gh>\n<blue:\n[ij] kl\n>\n".repeat(6);
    let tree = parser.parse(text);
    const mismatches: string[] = [];
    for (let step = 0; step < 30; step++) {
      const at = Math.floor(rand() * text.length);
      const insert = ALPHABET[Math.floor(rand() * ALPHABET.length)]!;
      const remove = Math.min(insert === "" ? 1 : rand() < 0.3 ? 1 : 0, text.length - at);
      ({ next: text, tree } = edit(parser, tree, text, at, insert, remove));
      const cold = parser.parse(text);
      if (
        printTree(tree, text) !== printTree(cold, text) ||
        scopesOf(parser, tree, text).join("|") !== scopesOf(parser, cold, text).join("|")
      ) {
        mismatches.push(`step ${step} at ${at} ${JSON.stringify(insert)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
