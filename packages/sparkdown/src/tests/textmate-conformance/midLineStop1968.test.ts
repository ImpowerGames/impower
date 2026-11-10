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
    Word: { name: "word.mini", match: "[A-Za-z]+" },
    Gap: { match: "\\s" },
    ...repository,
  },
});

const inCapture = (grammar: ReturnType<typeof grammarOf>, name?: string) => ({
  ...grammar,
  patterns: [{ match: "^(?:-)(.+)", captures: { "1": { name, patterns: ROOT } } }, ...ROOT],
});

const GRAMMARS = {
  nonAdvancingMatch: grammarOf({
    Block: {
      name: "block.mini",
      begin: "<",
      end: ">",
      patterns: [{ name: "mark.mini", match: "(?=a)" }, { include: "#Word" }, { include: "#Gap" }],
    },
  }),
  nestedNonAdvancingMatch: grammarOf({
    Block: {
      name: "block.mini",
      begin: "<",
      end: ">",
      patterns: [{ include: "#Inner" }, { include: "#Word" }, { include: "#Gap" }],
    },
    Inner: {
      name: "inner.mini",
      begin: "\\[",
      end: "\\]",
      patterns: [{ name: "mark.mini", match: "(?=a)" }, { include: "#Word" }, { include: "#Gap" }],
    },
  }),
  recursiveEmptyBegin: grammarOf({
    Block: {
      name: "block.mini",
      begin: "(?=<)",
      end: ">",
      patterns: [{ include: "#Block" }, { include: "#Word" }, { include: "#Gap" }],
    },
  }),
  recursiveEmptyBeginAfterEndPatterns: grammarOf({
    Block: {
      name: "block.mini",
      begin: "(?=<)",
      end: ">",
      applyEndPatternLast: true,
      patterns: [{ include: "#Block" }, { include: "#Word" }, { include: "#Gap" }],
    },
  }),
};

const CAPTURED = {
  nonAdvancingMatchInCapture: inCapture(GRAMMARS.nonAdvancingMatch),
  nonAdvancingMatchInNamedCapture: inCapture(GRAMMARS.nonAdvancingMatch, "cap.mini"),
  nestedNonAdvancingMatchInCapture: inCapture(GRAMMARS.nestedNonAdvancingMatch, "cap.mini"),
  recursiveEmptyBeginInCapture: inCapture(GRAMMARS.recursiveEmptyBegin),
  recursiveEmptyBeginInNamedCapture: inCapture(GRAMMARS.recursiveEmptyBegin, "cap.mini"),
};

const CASES: [keyof typeof GRAMMARS, string, string, string][] = [
  ["nonAdvancingMatch", "<abc> d\n", "d", "source.mini"],
  ["nonAdvancingMatch", "<abc> d\nef <g a> h\n", "ef", "source.mini word.mini"],
  ["nestedNonAdvancingMatch", "<x [abc] y> z\nw>\nv\n", "y", "source.mini block.mini"],
  ["nestedNonAdvancingMatch", "<x [abc] y> z\nw>\nv\n", "v", "source.mini word.mini"],
  ["recursiveEmptyBegin", "<abc> d\n", "d", "source.mini block.mini"],
  ["recursiveEmptyBegin", "<abc> d\nef> g\n", "g", "source.mini word.mini"],
  ["recursiveEmptyBeginAfterEndPatterns", "<abc> d\nef> g\n", "d", "source.mini block.mini"],
  ["nonAdvancingMatch", "<abc> d", "d", "source.mini"],
  ["recursiveEmptyBegin", "<abc> d", "d", "source.mini block.mini"],
];

describe("textmate-grammar-tree pops a rule that does not advance mid-line and stops the line, as vscode-textmate does (I-1968)", () => {
  test.each(CASES)("%s: %j at %j", async (name, text, probe, scope) => {
    const grammar = GRAMMARS[name];
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(vscode[text.lastIndexOf(probe)], "the case reaches the stopped line").toBe(scope);
    expect(treeScopes(grammar, text)).toEqual(vscode);
  });
});

const CAPTURE_CASES: [keyof typeof CAPTURED, string, string, string][] = [
  ["nonAdvancingMatchInCapture", "-<abc> d\nef\n", "d", "source.mini"],
  ["nonAdvancingMatchInNamedCapture", "-<abc> d\nef\n", "d", "source.mini cap.mini"],
  ["nestedNonAdvancingMatchInCapture", "-<x [abc] y> z\nw\n", "y", "source.mini cap.mini block.mini"],
  ["recursiveEmptyBeginInCapture", "-<abc> d\nef\n", "d", "source.mini block.mini"],
  ["recursiveEmptyBeginInNamedCapture", "-<abc> d\nef\n", "d", "source.mini cap.mini block.mini"],
];

describe("a capture's patterns pop a rule that does not advance and stop at the capture's end, as vscode-textmate does (I-1968)", () => {
  test.each(CAPTURE_CASES)("%s: %j at %j", async (name, text, probe, scope) => {
    const grammar = CAPTURED[name];
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(vscode[text.lastIndexOf(probe)], "the case reaches the stopped capture").toBe(scope);
    expect(treeScopes(grammar, text)).toEqual(vscode);
  });
});

describe("an incremental parse agrees with a cold parse around a stopped line (I-1968)", () => {
  const grammar = grammarOf({
    Block: {
      name: "block.mini",
      begin: "(?=<)",
      end: ">",
      patterns: [{ include: "#Block" }, { include: "#Inner" }, { include: "#Word" }, { include: "#Gap" }],
    },
    Inner: {
      name: "inner.mini",
      begin: "\\[",
      end: "\\]",
      patterns: [{ name: "mark.mini", match: "(?=a)" }, { include: "#Word" }, { include: "#Gap" }],
    },
  });
  const parser = new TextmateGrammarParser(structuredClone(grammar) as never);

  const PAD = "aa bb\n".repeat(20);
  const BODY = "cc <dd [ee aa ff] gg\nhh ii>\njj kk\n<ll mm\nnn> oo\n".repeat(8);
  const TEXT = `${PAD}${BODY}${PAD}`;

  const insert = (text: string, at: number, before: Tree) => {
    const next = `${text.slice(0, at)}z${text.slice(at)}`;
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [
      { fromA: at, toA: at, fromB: at, toB: at + 1 },
    ]);
    return { next, tree: parser.parse(next, fragments) };
  };

  test("the cold parse scopes the stopped lines as vscode-textmate does", async () => {
    const vscode = await vscodeScopes(structuredClone(grammar), TEXT);
    expect(vscode[TEXT.indexOf("gg")]).toBe("source.mini block.mini");
    expect(vscode[TEXT.indexOf("mm")]).toBe("source.mini block.mini");
    expect(treeScopes(grammar, TEXT)).toEqual(vscode);
  });

  test("matches a cold parse for an edit anywhere in the stopped lines", () => {
    const cold = parser.parse(TEXT);
    const mismatches: number[] = [];
    for (let at = PAD.length - 3; at < PAD.length + BODY.length + 3; at += 3) {
      const { next, tree } = insert(TEXT, at, cold);
      if (printTree(tree, next) !== printTree(parser.parse(next), next)) {
        mismatches.push(at);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
