import { Compiler } from "@impower/textmate-grammar-tree/src/compiler/classes/Compiler";
import { GrammarRegistry } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarRegistry";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, test, vi } from "vitest";
import { treeScopes, vscodeScopes } from "./engineScopes";

const OUTER = {
  name: "outer",
  scopeName: "source.outer",
  patterns: [
    { include: "#Block" },
    { include: "#Pick" },
    { include: "#Skip" },
    { include: "#Hollow" },
    { include: "#Lack" },
    { include: "#Void" },
    { include: "#Word" },
    { include: "#Gap" },
  ],
  repository: {
    Block: { name: "block.outer", begin: "\\{", end: "\\}", patterns: [{ include: "source.inner" }] },
    Pick: {
      name: "pick.outer",
      begin: "\\[",
      end: "\\]",
      patterns: [{ include: "source.inner#Number" }, { include: "#Word" }, { include: "#Gap" }],
    },
    Skip: {
      name: "skip.outer",
      begin: "<",
      end: ">",
      patterns: [{ include: "source.missing" }, { include: "source.missing#Number" }, { include: "#Word" }, { include: "#Gap" }],
    },
    Hollow: { name: "hollow.outer", begin: "%", end: "%", patterns: [{ include: "#Empty" }] },
    Empty: { name: "empty.outer", begin: "!", end: "!", patterns: [{ include: "source.missing" }] },
    Lack: {
      name: "lack.outer",
      begin: "\\^",
      end: "\\^",
      patterns: [{ include: "source.inner#Absent" }, { include: "#Absent" }, { include: "#Word" }, { include: "#Gap" }],
    },
    Void: { name: "void.outer", begin: "~", end: "~", patterns: [{ include: "source.inner#Absent" }] },
    Word: { name: "word.outer", match: "[a-z]+" },
    Gap: { match: "\\s" },
  },
};

const INNER = {
  name: "inner",
  scopeName: "source.inner",
  patterns: [{ include: "#Group" }, { include: "#Back" }, { include: "#Number" }, { include: "#Word" }, { include: "#Gap" }],
  repository: {
    Group: { name: "group.inner", begin: "\\(", end: "\\)", patterns: [{ include: "$self" }] },
    Back: { name: "back.inner", begin: "@", end: "@", patterns: [{ include: "$base" }] },
    Number: { name: "number.inner", match: "[0-9]+" },
    Word: { name: "word.inner", match: "[a-z]+" },
    Gap: { match: "\\s" },
  },
};

const scopesAt = (scopes: string[], text: string, needle: string, from = 0) => scopes[text.indexOf(needle, from)];

const registryParser = (start: { scopeName: string } = OUTER) =>
  new TextmateGrammarParser(new GrammarRegistry([structuredClone(OUTER), structuredClone(INNER)], start.scopeName));

describe("includes that name a grammar scope as vscode-textmate does (I-2026)", () => {
  test.each([
    ["scope.name", "a { b 1 } c\n", "b", "source.outer block.outer word.inner"],
    ["scope.name#Rule", "a [ 1 x ] c\n", "x", "source.outer pick.outer word.outer"],
    ["$self", "{ ( b ( 2 ) ) }\n", "2", "source.outer block.outer group.inner group.inner number.inner"],
    ["$base", "{ @ a [ 3 ] @ }\n", "3", "source.outer block.outer back.inner pick.outer number.inner"],
    ["an include of a scope that is not loaded", "a < b c > d\n", "c", "source.outer skip.outer word.outer"],
    ["an include of a rule that a grammar lacks", "a ^ b ^ c\n", "b", "source.outer lack.outer word.outer"],
  ])("%s", async (_, text, needle, expected) => {
    const vscode = await vscodeScopes(structuredClone(OUTER), text, [structuredClone(INNER)]);
    expect(scopesAt(vscode, text, needle)).toBe(expected);
    expect(treeScopes(OUTER, text, [INNER])).toEqual(vscode);
  });

  test("$base names the grammar the parse started from", async () => {
    const text = "@ a @\n";
    const vscode = await vscodeScopes(structuredClone(INNER), text, [structuredClone(OUTER)]);
    expect(scopesAt(vscode, text, "a")).toBe("source.inner back.inner word.inner");
    expect(treeScopes(INNER, text, [OUTER], OUTER)).toEqual(vscode);
  });

  test("a grammar that includes its own scope name reads its root patterns", async () => {
    const grammar = {
      ...structuredClone(INNER),
      repository: { ...structuredClone(INNER.repository), Group: { name: "group.inner", begin: "\\(", end: "\\)", patterns: [{ include: "source.inner" }] } },
    };
    const text = "( a ( 1 ) )\n";
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(scopesAt(vscode, text, "1")).toBe("source.inner group.inner group.inner number.inner");
    expect(treeScopes(grammar, text, [OUTER])).toEqual(vscode);
  });

  test("a repository rule that is itself an include reads what it names", async () => {
    const inner = {
      ...structuredClone(INNER),
      patterns: [{ include: "#Alias" }, { include: "#Gap" }],
      repository: { ...structuredClone(INNER.repository), Alias: { include: "source.outer#Word" } },
    };
    const text = "{ a b }\n";
    const vscode = await vscodeScopes(structuredClone(OUTER), text, [structuredClone(inner)]);
    expect(scopesAt(vscode, text, "a")).toBe("source.outer block.outer word.outer");
    expect(treeScopes(OUTER, text, [inner])).toEqual(vscode);
  });

  test("a rule whose patterns are all missing includes is skipped, and so is a rule that includes only it", async () => {
    const text = "a %% ! b ! ~~ c\n";
    const vscode = await vscodeScopes(structuredClone(OUTER), text, [structuredClone(INNER)]);
    expect(scopesAt(vscode, text, "%")).toBe("source.outer");
    expect(scopesAt(vscode, text, "!")).toBe("source.outer");
    expect(scopesAt(vscode, text, "~")).toBe("source.outer");
    expect(treeScopes(OUTER, text, [INNER])).toEqual(vscode);
  });

  test("a grammar alone still parses when its includes name a scope it does not hold", async () => {
    const text = "a {} c\n";
    expect(treeScopes(OUTER, text)).toEqual(await vscodeScopes(structuredClone(OUTER), text));
  });

  test("a grammar with no repository skips its rule includes, alone or included", async () => {
    const bare = {
      name: "bare",
      scopeName: "source.inner",
      patterns: [{ include: "#Absent" }, { name: "word.bare", match: "[a-z]+" }, { match: "\\s" }],
    };
    const alone = "a b\n";
    const vscodeAlone = await vscodeScopes(structuredClone(bare), alone);
    expect(scopesAt(vscodeAlone, alone, "b")).toBe("source.inner word.bare");
    expect(treeScopes(bare, alone)).toEqual(vscodeAlone);

    const included = "a { b } c\n";
    const vscodeIncluded = await vscodeScopes(structuredClone(OUTER), included, [structuredClone(bare)]);
    expect(scopesAt(vscodeIncluded, included, "b")).toBe("source.outer block.outer word.bare");
    expect(treeScopes(OUTER, included, [bare])).toEqual(vscodeIncluded);
  });
});

describe("node types across grammars (I-2026)", () => {
  test("two grammars that define a rule of the same name keep separate node types", () => {
    const parser = registryParser();
    const names = parser.nodeSet.types.map((type) => type.name);
    expect(new Set(names).size).toBe(names.length);
    parser.nodeSet.types.forEach((type, i) => expect(type.id).toBe(i));
    const outerWord = names.indexOf("Word");
    const innerWord = names.indexOf("source.inner#Word");
    expect(outerWord).toBeGreaterThan(0);
    expect(innerWord).toBeGreaterThan(0);
    expect(outerWord).not.toBe(innerWord);

    const text = "a { b }\n";
    const tree = parser.parse(text);
    expect(tree.resolveInner(text.indexOf("a"), 1).name).toBe("Word");
    expect(tree.resolveInner(text.indexOf("b"), 1).name).toBe("source.inner#Word");
  });

  test("a rule whose definition carries an id is still named and found for its own grammar", () => {
    const inner = {
      ...structuredClone(INNER),
      repository: { ...structuredClone(INNER.repository), Word: { id: "Word", name: "word.inner", match: "[a-z]+" } },
    };
    const parser = new TextmateGrammarParser(new GrammarRegistry([structuredClone(OUTER), inner]));
    const names = parser.nodeSet.types.map((type) => type.name);
    expect(new Set(names).size).toBe(names.length);
    const text = "a { b }\n";
    const tree = parser.parse(text);
    expect(tree.resolveInner(text.indexOf("a"), 1).name).toBe("Word");
    expect(tree.resolveInner(text.indexOf("b"), 1).name).toBe("source.inner#Word");
  });

  test("the first grammar of the registry keeps bare names and names the top node, whichever grammar the parse starts from", () => {
    const parser = registryParser(INNER);
    const text = "@ a @\n";
    const tree = parser.parse(text);
    expect(tree.topNode.name).toBe("outer");
    expect(tree.resolveInner(text.indexOf("@"), 1).parent?.name).toBe("source.inner#Back");
  });
});

describe("an incremental reparse across a boundary between grammars (I-2026)", () => {
  const parser = registryParser();
  const LINE = "a { b ( c 1 ) @ d [ 2 x ] { e } @ f } [ 3 y ] < g >\n";
  const TEXT = LINE.repeat(40);

  const edit = (text: string, before: Tree, from: number, to: number, insert: string) => {
    const next = `${text.slice(0, from)}${insert}${text.slice(to)}`;
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [
      { fromA: from, toA: to, fromB: from, toB: from + insert.length },
    ]);
    return { next, tree: parser.parse(next, fragments) };
  };

  test("the cold parse scopes the text as vscode-textmate does", async () => {
    const vscode = await vscodeScopes(structuredClone(OUTER), TEXT, [structuredClone(INNER)]);
    expect(treeScopes(OUTER, TEXT, [INNER])).toEqual(vscode);
  });

  test.each([
    ["inserting a letter", (at: number) => [at, at, "z"] as const],
    ["deleting a character", (at: number) => [at, at + 1, ""] as const],
    ["opening a block", (at: number) => [at, at, "{ "] as const],
    ["closing a block", (at: number) => [at, at, " }"] as const],
  ])("%s at every position of a middle line gives the cold parse's tree", (_, change) => {
    const lineStart = LINE.length * 20;
    const reuse = vi.spyOn(Compiler.prototype, "reuse");
    const mismatches: number[] = [];
    const cold: number[] = [];
    try {
      for (let at = lineStart; at < lineStart + LINE.length; at++) {
        const before = parser.parse(TEXT);
        const [from, to, insert] = change(at);
        const calls = reuse.mock.calls.length;
        const { next, tree } = edit(TEXT, before, from, to, insert);
        if (reuse.mock.calls.length === calls) {
          cold.push(at - lineStart);
        }
        if (printTree(tree, next) !== printTree(parser.parse(next), next)) {
          mismatches.push(at - lineStart);
        }
      }
    } finally {
      reuse.mockRestore();
    }
    expect(cold, "every edit reparses from the earlier tree").toEqual([]);
    expect(mismatches).toEqual([]);
  });
});
