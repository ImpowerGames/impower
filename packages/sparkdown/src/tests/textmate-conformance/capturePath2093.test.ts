import { GrammarState } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarState";
import { MatchRule } from "@impower/textmate-grammar-tree/src/grammar/classes/rules/MatchRule";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { afterEach, describe, expect, test, vi } from "vitest";
import BUILTINS from "../../compiler/builtins/builtins.sd?raw";
import { createSparkdownParser } from "../../compiler/utils/createSparkdownParser";
import { treeScopes, vscodeScopes } from "./engineScopes";

const grammar = (repository: Record<string, unknown>, patterns: unknown[]) => ({
  name: "probe",
  scopeName: "source.probe",
  patterns,
  repository: { Word: { name: "word.probe", match: "[a-z]+" }, ...repository },
});

const CAPTURED = grammar(
  {
    Line: {
      match: "^-(.+)([;])(.+)$",
      captures: {
        "1": { name: "head.probe", patterns: [{ include: "#Block" }, { include: "#Word" }] },
        "2": { name: "separator.probe" },
        "3": { name: "tail.probe", patterns: [{ include: "#Line" }, { include: "#Word" }] },
      },
    },
    Wrapper: { patterns: [{ include: "#Block" }] },
    Block: {
      name: "block.probe",
      begin: "<",
      end: ">",
      patterns: [{ include: "#Wrapper" }, { include: "#Word" }],
    },
  },
  [{ include: "#Line" }, { include: "#Wrapper" }, { include: "#Word" }, { match: ".|\\n" }],
);

const REENTERED = {
  ...CAPTURED,
  repository: {
    ...CAPTURED.repository,
    Block: {
      name: "block.probe",
      begin: "(?=<)",
      end: ">",
      patterns: [{ include: "#Wrapper" }, { match: "<", name: "open.probe" }, { include: "#Word" }],
    },
  },
};

const RECURSIVE = {
  ...CAPTURED,
  patterns: [{ include: "#Self" }, ...CAPTURED.patterns],
  repository: { ...CAPTURED.repository, Self: { patterns: [{ include: "#Self" }, { include: "#Line" }] } },
};

const TEXTS = [
  "-a <b <c> d> e;f\n",
  "-<a <b>>;-c;d\n",
  "-a;-b <c>;-d;e\n",
  "x <y <z> w> v\n-<p>;q\n",
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a capture's patterns are read as vscode-textmate reads them on the lighter capture path (I-2093)", () => {
  test.each(TEXTS)("%j", async (text) => {
    expect(treeScopes(CAPTURED, text)).toEqual(await vscodeScopes(structuredClone(CAPTURED), text));
  });

  test.each(["<a> b\n", "-<a <b>> c;<d>\n", "x <<a>> y\n"])(
    "a rule reached through an include list, re-entered at its own zero-width begin: %j",
    async (text) => {
      expect(treeScopes(REENTERED, text)).toEqual(await vscodeScopes(structuredClone(REENTERED), text));
    },
  );

  test("a pattern list that includes itself at the same position is cut off without recursing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const text = "-a <b> c;d\nx <y> z\n";
    expect(treeScopes(RECURSIVE, text)).toEqual(treeScopes(CAPTURED, text));
    expect(warn.mock.calls.some((call) => call[0] === "Infinite recursion detected!")).toBe(true);
  });
});

describe("the recursion guard holds only rules that can recurse (I-2093)", () => {
  test("a cold parse of builtins.sd records no single match rule on the recursion guard", () => {
    const matchIds = new Set<string>();
    const matchGroups = MatchRule.prototype.matchGroups;
    vi.spyOn(MatchRule.prototype, "matchGroups").mockImplementation(function (this: MatchRule, ...args) {
      matchIds.add(this.id);
      return matchGroups.apply(this, args);
    });
    const entered: string[] = [];
    const enter = GrammarState.prototype.enter;
    vi.spyOn(GrammarState.prototype, "enter").mockImplementation(function (this: GrammarState, ...args) {
      entered.push(args[0]);
      return enter.apply(this, args);
    });
    createSparkdownParser().parse(BUILTINS);
    expect(matchIds.size).toBeGreaterThan(100);
    expect(entered.length).toBeGreaterThan(0);
    expect(entered.filter((id) => matchIds.has(id)).slice(0, 5)).toEqual([]);
  });
});

describe("an incremental parse agrees with a cold parse along random edit chains through captures (I-2093)", () => {
  const parser = new TextmateGrammarParser(structuredClone(CAPTURED) as never);
  const BODY = TEXTS.join("").repeat(8);
  const ALPHABET = ["a", "<", ">", ";", "-", " ", "\n", ""];

  const random = (seed: number) => () => {
    seed = (Math.imul(seed, 1103515245) + 12345) | 0;
    return ((seed >>> 0) % 1_000_000) / 1_000_000;
  };

  const edit = (text: string, at: number, insert: string, remove: number, before: Tree) => {
    const next = `${text.slice(0, at)}${insert}${text.slice(at + remove)}`;
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [
      { fromA: at, toA: at + remove, fromB: at, toB: at + insert.length },
    ]);
    return { next, tree: parser.parse(next, fragments) };
  };

  test.each([1, 2, 3, 4, 5, 6])("seed %i", (seed) => {
    const rand = random(seed);
    let text = BODY;
    let tree = parser.parse(text);
    const mismatches: string[] = [];
    for (let step = 0; step < 25; step++) {
      const at = Math.floor(rand() * text.length);
      const insert = ALPHABET[Math.floor(rand() * ALPHABET.length)]!;
      const remove = insert === "" ? 1 : rand() < 0.3 ? 1 : 0;
      ({ next: text, tree } = edit(text, at, insert, Math.min(remove, text.length - at), tree));
      if (printTree(tree, text) !== printTree(parser.parse(text), text)) {
        mismatches.push(`step ${step} at ${at} ${JSON.stringify(insert)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
