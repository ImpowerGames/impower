import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { treeScopes, vscodeScopes } from "./engineScopes";

const ROOT = [{ include: "#Block" }, { include: "#Word" }, { include: "#Gap" }];

const grammarOf = (repository: Record<string, unknown>, patterns: unknown[] = ROOT) => ({
  name: "mini",
  scopeName: "source.mini",
  patterns,
  repository: {
    Word: { name: "word.mini", match: "[a-z]+" },
    Gap: { match: "\\s" },
    ...repository,
  },
});

const block = (fields: Record<string, unknown>) => grammarOf({ Block: { name: "block.mini", ...fields } });

const GRAMMARS = {
  braceWithX: {
    scopeName: "s",
    patterns: [{ match: "a", name: "a" }, { name: "Outer", begin: "[{]", end: "[}]", patterns: [{ match: "x", name: "X" }] }],
  },
  contentNameNoPatterns: {
    scopeName: "source.probe",
    repository: { Foo: { name: "outer", begin: "<", end: ">", contentName: "ci" } },
    patterns: [{ include: "#Foo" }],
  },
  wordsOnly: block({ begin: "<", end: ">", patterns: [{ include: "#Word" }] }),
  wordsOnlyEndLast: block({ begin: "<", end: ">", applyEndPatternLast: true, patterns: [{ include: "#Word" }] }),
  nested: grammarOf({
    Block: { name: "block.mini", begin: "<", end: ">", patterns: [{ include: "#Inner" }, { include: "#Word" }] },
    Inner: { name: "inner.mini", begin: "\\[", end: "\\]", patterns: [{ include: "#Word" }] },
  }),
  contentNamed: block({ begin: "<", end: ">", contentName: "inside.mini", patterns: [{ include: "#Word" }] }),
  anchoredFirst: block({
    begin: "<",
    end: ">",
    patterns: [{ name: "first.mini", match: "\\G[a-z]" }, { include: "#Word" }],
  }),
  lineStartOnly: block({
    begin: "<",
    end: ">",
    patterns: [{ name: "start.mini", match: "^[a-z]+" }, { include: "#Word" }],
  }),
  topLevelZeroWidth: grammarOf({}, [{ name: "mark.mini", match: "(?=a)" }, { include: "#Word" }, { include: "#Gap" }]),
  pushedAndPopped: block({ begin: "(?=<)", end: "(?=<)", patterns: [{ include: "#Word" }, { include: "#Gap" }] }),
  pushedAndPoppedNamed: block({
    begin: "(?=<)",
    end: "(?=<)",
    contentName: "inside.mini",
    patterns: [{ include: "#Word" }, { include: "#Gap" }],
  }),
  pushedAndPoppedInside: grammarOf({
    Block: { name: "block.mini", begin: "\\{", end: "\\}", patterns: [{ include: "#Inner" }, { include: "#Word" }, { include: "#Gap" }] },
    Inner: { name: "inner.mini", begin: "(?=<)", end: "(?=<)", patterns: [{ include: "#Word" }, { include: "#Gap" }] },
  }),
};

const CASES: [keyof typeof GRAMMARS, string, string, string][] = [
  ["braceWithX", "{ x }", "x", "s Outer X"],
  ["braceWithX", "{ x } a", "a", "s a"],
  ["contentNameNoPatterns", "<q> z", "q", "source.probe outer ci"],
  ["contentNameNoPatterns", "<q> z", ">", "source.probe outer"],
  ["wordsOnly", "<ab?>cd\n", "?", "source.mini block.mini"],
  ["wordsOnly", "<ab ?? cd> ef\n", "cd", "source.mini block.mini word.mini"],
  ["wordsOnly", "<ab 1> ef\n", "ef", "source.mini word.mini"],
  ["wordsOnlyEndLast", "<a ? b> c\n", "b", "source.mini block.mini word.mini"],
  ["nested", "<a [b ? c] d> e\n", "d", "source.mini block.mini word.mini"],
  ["nested", "<a [b ? c] d> e\n", "c", "source.mini block.mini inner.mini word.mini"],
  ["contentNamed", "<a ? b> c\n", "?", "source.mini block.mini inside.mini"],
  ["wordsOnly", "<a\n??\nb> c\n", "b", "source.mini block.mini word.mini"],
  ["wordsOnly", "<a\r\n??\r\nb> c\r\n", "b", "source.mini block.mini word.mini"],
  ["wordsOnly", "<a 😀 b> c\n", "b", "source.mini block.mini word.mini"],
  ["wordsOnly", "<a 名 b> c\n", "b", "source.mini block.mini word.mini"],
  ["anchoredFirst", "<?a> b\n", "a", "source.mini block.mini word.mini"],
  ["anchoredFirst", "<a?b> c\n", "a", "source.mini block.mini first.mini"],
  ["lineStartOnly", "<a\n b\nc> d\n", "c", "source.mini block.mini start.mini"],
  ["lineStartOnly", "<a\n b\nc> d\n", "b", "source.mini block.mini word.mini"],
  ["topLevelZeroWidth", "xx a bb\ncc\n", "bb", "source.mini"],
  ["topLevelZeroWidth", "xx a bb\ncc\n", "cc", "source.mini word.mini"],
  ["pushedAndPopped", "ab <cd> ef\ngh\n", "ef", "source.mini block.mini"],
  ["pushedAndPopped", "ab <cd> ef\ngh\n", "gh", "source.mini block.mini word.mini"],
  ["pushedAndPoppedNamed", "ab <cd> ef\ngh\n", "gh", "source.mini block.mini word.mini"],
  ["pushedAndPoppedInside", "{ab <cd> ef\ngh} ij\n", "ij", "source.mini block.mini inner.mini word.mini"],
];

describe("textmate-grammar-tree passes over a character no pattern of the open rule reads, as vscode-textmate does (I-2055)", () => {
  test.each(CASES)("%s: %j at %j", async (name, text, probe, scope) => {
    const grammar = GRAMMARS[name];
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(vscode[text.lastIndexOf(probe)], "vscode-textmate reads the case as the test expects").toBe(scope);
    expect(treeScopes(grammar, text)).toEqual(vscode);
  });
});

const BEGINS = ["<", "(?=<)", "(?:\\G<|(?=<))"];
const ENDS = [">", "(?=>)", "(?=<)", "$"];

const lineEndGrammar = (begin: string, end: string, applyEndPatternLast: boolean) => ({
  name: "probe",
  scopeName: "source.probe",
  patterns: [{ include: "#Block" }, { match: ".", name: "letter.probe" }, { match: "\\n" }],
  repository: {
    Block: { name: "block.probe", begin, end, applyEndPatternLast, patterns: [{ match: ".", name: "inner.probe" }] },
  },
});

describe("a rule left open at a line break its patterns cannot read stays open on the next line, as in vscode-textmate (I-2055)", () => {
  const combinations = BEGINS.flatMap((begin) =>
    ENDS.flatMap((end) => [false, true].map((last) => [begin, end, last] as const)),
  );
  test.each(combinations)("begin %j, end %j, applyEndPatternLast %j", async (begin, end, last) => {
    const grammar = lineEndGrammar(begin, end, last);
    const text = "<abc> x\nnext\n";
    expect(treeScopes(grammar, text)).toEqual(await vscodeScopes(structuredClone(grammar), text));
  });
});

const nodesNamed = (tree: Tree, name: string) => {
  const found: { from: number; to: number; parent: string }[] = [];
  tree.iterate({
    enter: (node) => {
      if (node.name === name) found.push({ from: node.from, to: node.to, parent: node.node.parent?.name ?? "" });
    },
  });
  return found;
};

describe("skipped text stays in the tree, inside the rule it was skipped in (I-2055)", () => {
  const parse = (grammar: unknown, text: string) => new TextmateGrammarParser(structuredClone(grammar) as never).parse(text);

  test("each run of skipped characters on a line is one unrecognized node in the open rule's content", () => {
    const text = "<ab ?? cd 1> ef\n";
    const tree = parse(GRAMMARS.wordsOnly, text);
    const runs = nodesNamed(tree, "ERROR_UNRECOGNIZED").map((n) => [text.slice(n.from, n.to), n.parent]);
    expect(runs).toEqual([
      [" ?? ", "Block_content"],
      [" 1", "Block_content"],
    ]);
    expect(nodesNamed(tree, "ERROR_INCOMPLETE")).toEqual([]);
  });

  test("a skipped line break is plain text in the open rule, not an unrecognized node", () => {
    const text = "<a\nb> c\n";
    const tree = parse(GRAMMARS.wordsOnly, text);
    expect(nodesNamed(tree, "ERROR_UNRECOGNIZED")).toEqual([]);
    expect(nodesNamed(tree, "Block").map((n) => text.slice(n.from, n.to))).toEqual(["<a\nb>"]);
  });

  test("a surrogate pair is skipped whole", () => {
    const text = "<a 😀b> c\n";
    const tree = parse(GRAMMARS.wordsOnly, text);
    expect(nodesNamed(tree, "ERROR_UNRECOGNIZED").map((n) => text.slice(n.from, n.to))).toEqual([" 😀"]);
  });
});

describe("an incremental parse agrees with a cold parse across skipped gaps (I-2055)", () => {
  const grammar = grammarOf({
    Block: {
      name: "block.mini",
      begin: "<",
      end: ">",
      patterns: [{ include: "#Inner" }, { include: "#Word" }],
    },
    Inner: {
      name: "inner.mini",
      begin: "(?=\\[)",
      end: "(?=\\[)",
      patterns: [{ include: "#Word" }, { include: "#Gap" }],
    },
  });
  const parser = new TextmateGrammarParser(structuredClone(grammar) as never);

  const PAD = "aa bb\n".repeat(20);
  const BODY = "cc <dd ?? ee\nff 12 gg\n?? hh> ii\njj <kk [ll mm\nnn> oo\n<pp> qq\n".repeat(6);
  const TEXT = `${PAD}${BODY}${PAD}`;

  const edit = (text: string, at: number, insert: string, remove: number, before: Tree) => {
    const next = `${text.slice(0, at)}${insert}${text.slice(at + remove)}`;
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [
      { fromA: at, toA: at + remove, fromB: at, toB: at + insert.length },
    ]);
    return { next, tree: parser.parse(next, fragments) };
  };

  test("the cold parse scopes the gaps as vscode-textmate does", async () => {
    const vscode = await vscodeScopes(structuredClone(grammar), TEXT);
    expect(vscode[TEXT.indexOf("gg")]).toBe("source.mini block.mini word.mini");
    expect(vscode[TEXT.indexOf("nn")]).toBe("source.mini block.mini inner.mini word.mini");
    expect(treeScopes(grammar, TEXT)).toEqual(vscode);
  });

  test.each([
    ["inserting a letter", "z", 0],
    ["inserting an unreadable character", "?", 0],
    ["deleting a character", "", 1],
    ["inserting a line break", "\n", 0],
  ])("matches a cold parse for %s anywhere in the gapped lines", (_, insert, remove) => {
    const cold = parser.parse(TEXT);
    const mismatches: number[] = [];
    for (let at = PAD.length - 3; at < PAD.length + BODY.length + 3; at += 2) {
      const { next, tree } = edit(TEXT, at, insert, remove, cold);
      if (printTree(tree, next) !== printTree(parser.parse(next), next)) {
        mismatches.push(at);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test.each([
    ["inserting a letter", "z", 0],
    ["deleting a character", "", 1],
    ["inserting a line break", "\n", 0],
  ])("matches a cold parse for an edit on the incremental tree after %s anywhere in the gapped lines (I-2080)", (_, insert, remove) => {
    const cold = parser.parse(TEXT);
    const later = TEXT.indexOf("ff 12 gg", PAD.length + BODY.length / 2);
    const mismatches: number[] = [];
    for (let at = PAD.length - 3; at < PAD.length + BODY.length + 3; at += 5) {
      const first = edit(TEXT, at, insert, remove, cold);
      const shifted = at < later ? later + insert.length - remove : later;
      const { next, tree } = edit(first.next, shifted, "?", 0, first.tree);
      if (printTree(tree, next) !== printTree(parser.parse(next), next)) {
        mismatches.push(at);
      }
    }
    expect(mismatches).toEqual([]);
  });

  test.each([1, 2, 3, 4])("matches a cold parse at every step of a random chain of edits through the gapped lines, seed %i (I-2093)", (seed) => {
    let state = seed;
    const rand = () => {
      state = (Math.imul(state, 1103515245) + 12345) | 0;
      return ((state >>> 0) % 1_000_000) / 1_000_000;
    };
    const inserts = ["z", "?", "\n", "<", ">", "[", " ", ""];
    let text = TEXT;
    let tree = parser.parse(text);
    const mismatches: number[] = [];
    for (let step = 0; step < 30; step++) {
      const at = PAD.length + Math.floor(rand() * BODY.length);
      const insert = inserts[Math.floor(rand() * inserts.length)]!;
      ({ next: text, tree } = edit(text, at, insert, insert === "" ? 1 : 0, tree));
      if (printTree(tree, text) !== printTree(parser.parse(text), text)) {
        mismatches.push(step);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
