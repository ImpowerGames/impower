import { ResumableTokenizer } from "@impower/textmate-grammar-tree/src/grammar/classes/ResumableTokenizer";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, test, vi } from "vitest";
import { treeScopes, vscodeScopes } from "./engineScopes";

const grammarOf = (
  repository: Record<string, unknown>,
  patterns: unknown[] = [{ include: "#Block" }, { include: "#Label" }, { include: "#Word" }, { include: "#Gap" }],
) => ({
  name: "mini",
  scopeName: "source.mini",
  patterns,
  repository: {
    Label: { name: "label.mini", match: "Label" },
    Word: { name: "word.mini", match: "[A-Za-z]+" },
    Gap: { match: "\\s" },
    ...repository,
  },
});

const GRAMMARS = {
  endAfterBreak: grammarOf({
    Block: {
      name: "block.mini",
      begin: "H\\n",
      end: "(?=$)",
      patterns: [{ include: "#Label" }, { include: "#Gap" }],
    },
  }),
  nonAdvancingMatch: grammarOf({
    Block: {
      name: "block.mini",
      begin: "H\\n",
      end: "x",
      patterns: [{ name: "mark.mini", match: "$" }, { include: "#Label" }, { include: "#Gap" }],
    },
  }),
  nonAdvancingMatchAfterEndPatterns: grammarOf({
    Block: {
      name: "block.mini",
      begin: "H\\n",
      end: "(?=$)",
      applyEndPatternLast: true,
      patterns: [{ name: "mark.mini", match: "$" }, { include: "#Label" }, { include: "#Gap" }],
    },
  }),
  pushedAndPoppedStaysOpen: grammarOf({
    Block: {
      name: "block.mini",
      begin: "H\\n",
      end: "^Stop\\b",
      patterns: [{ include: "#Inner" }, { include: "#Label" }, { include: "#Gap" }],
    },
    Inner: {
      name: "inner.mini",
      begin: "(?<=\\n)",
      end: "(?<=\\n)|(?=Stop\\b)",
      patterns: [{ include: "#Label" }, { include: "#Gap" }],
    },
  }),
  rootBeginAfterBreak: grammarOf(
    {
      Line: { name: "line.mini", match: "H\\n" },
      Tail: {
        name: "tail.mini",
        begin: "(?<=\\n)",
        end: "^(?=H|Stop)",
        patterns: [{ include: "#Label" }, { include: "#Gap" }],
      },
    },
    [{ include: "#Line" }, { include: "#Tail" }, { include: "#Word" }, { include: "#Gap" }],
  ),
  lineStartIsNotTheLineEnd: grammarOf(
    {
      Line: { name: "line.mini", match: "[A-Za-z]+\\n" },
      Empty: { name: "empty.mini", begin: "^$", end: "\\n" },
    },
    [{ include: "#Line" }, { include: "#Empty" }, { include: "#Word" }, { include: "#Gap" }],
  ),
  nested10: nestedGrammar(10),
  nested12: nestedGrammar(12),
};

function nestedGrammar(depth: number) {
  const repository: Record<string, unknown> = {};
  for (let i = 0; i < depth; i++) {
    const last = i === depth - 1;
    repository[`N${i}`] = {
      name: `n${i}.mini`,
      begin: last ? "A\\n" : "A",
      end: "(?=$)",
      patterns: last ? [{ include: "#Label" }, { include: "#Gap" }] : [{ include: `#N${i + 1}` }, { include: "#Label" }, { include: "#Gap" }],
    };
  }
  return grammarOf(repository, [{ include: "#N0" }, { include: "#Label" }, { include: "#Word" }, { include: "#Gap" }]);
}

const CASES: [keyof typeof GRAMMARS, string, string, string][] = [
  ["endAfterBreak", "H\nLabel\n", "Label", "source.mini label.mini"],
  ["nonAdvancingMatch", "H\nLabel\n", "Label", "source.mini label.mini"],
  ["nonAdvancingMatchAfterEndPatterns", "H\nLabel\n", "Label", "source.mini label.mini"],
  ["pushedAndPoppedStaysOpen", "H\nLabel\nLabel\nStop\n", "Label", "source.mini block.mini inner.mini label.mini"],
  ["rootBeginAfterBreak", "H\nLabel\nH\nStop\n", "Label", "source.mini tail.mini label.mini"],
  ["lineStartIsNotTheLineEnd", "Hi\nLabel\n\nLabel\n", "Label", "source.mini line.mini"],
  ["nested10", `${"A".repeat(10)}\nLabel\n`, "Label", "source.mini label.mini"],
  ["nested12", `${"A".repeat(12)}\nLabel\n`, "Label", "source.mini label.mini"],
];

describe("textmate-grammar-tree tries the exhausted end of a line after a match takes its line break, as vscode-textmate does (I-1965)", () => {
  test.each(CASES)("%s: %j", async (name, text, probe, scope) => {
    const grammar = GRAMMARS[name];
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(vscode[text.indexOf(probe)], "the case exercises the line end").toBe(scope);
    expect(treeScopes(grammar, text)).toEqual(vscode);
  });
});

describe("an incremental parse agrees with a cold parse at the exhausted end of a line (I-1965)", () => {
  const grammar = grammarOf(
    {
      Block: {
        name: "block.mini",
        begin: "^do\\n",
        end: "^end\\b",
        patterns: [{ include: "#Inner" }, { include: "#Word" }, { include: "#Gap" }],
      },
      Inner: {
        name: "inner.mini",
        begin: "(?<=\\n)",
        end: "(?<=\\n)|(?=end\\b)",
        patterns: [
          { include: "#Head" },
          { include: "#Bang" },
          { include: "#Paren" },
          { include: "#Label" },
          { include: "#Word" },
          { include: "#Gap" },
        ],
      },
      Paren: {
        name: "paren.mini",
        begin: "\\(",
        end: "\\)",
        patterns: [{ include: "#Word" }, { include: "#Gap" }],
      },
      Head: {
        name: "head.mini",
        begin: "H\\n",
        end: "(?=$)",
        patterns: [{ include: "#Word" }, { include: "#Gap" }],
      },
      Bang: {
        name: "bang.mini",
        begin: "!\\n",
        end: "x",
        patterns: [{ name: "mark.mini", match: "$" }, { include: "#Word" }, { include: "#Gap" }],
      },
    },
    [{ include: "#Block" }, { include: "#Word" }, { include: "#Gap" }],
  );
  const parser = new TextmateGrammarParser(structuredClone(grammar) as never);

  const PAD = "aa bb\n".repeat(20);
  const BODY = "aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp qq rr ss tt uu vv ww xx yy zz\nH\nLabel\n!\nLabel\n(aa bb\ncc dd\nee) ff\n".repeat(6);
  const TEXT = `${PAD}do\n${BODY}end\naa bb\n`;
  const BLOCK = PAD.length;

  const insert = (text: string, at: number, before: Tree) => {
    const next = `${text.slice(0, at)}z${text.slice(at)}`;
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [
      { fromA: at, toA: at, fromB: at, toB: at + 1 },
    ]);
    return { next, tree: parser.parse(next, fragments) };
  };

  test("the cold parse scopes the block as vscode-textmate does", async () => {
    const vscode = await vscodeScopes(structuredClone(grammar), TEXT);
    const label = TEXT.indexOf("Label", BLOCK);
    expect(vscode[label]).toBe("source.mini block.mini inner.mini label.mini");
    expect(vscode[TEXT.indexOf("H\n", BLOCK)]).toBe("source.mini block.mini inner.mini head.mini");
    expect(treeScopes(grammar, TEXT)).toEqual(vscode);
  });

  test("matches a cold parse for a second edit inside the block", () => {
    const restore = vi.spyOn(ResumableTokenizer.prototype, "restore");
    const mismatches: number[] = [];
    try {
      for (let at = BLOCK + 90; at < TEXT.length; at += 5) {
        const first = insert(TEXT, BLOCK + 4, parser.parse(TEXT));
        const second = insert(first.next, at, first.tree);
        if (printTree(second.tree, second.next) !== printTree(parser.parse(second.next), second.next)) {
          mismatches.push(at);
        }
      }
      const innerRestores = restore.mock.calls.filter(([resume]) =>
        resume.frames.some((frame) => frame.rule.node.props["name"] === "inner.mini"),
      );
      expect(innerRestores.length, "some edits resume inside a rule opened at a line end").toBeGreaterThan(0);
    } finally {
      restore.mockRestore();
    }
    expect(mismatches).toEqual([]);
  });
});

describe("an edit to a line changes what the end of that line opens at the top level (I-1965)", () => {
  const grammar = grammarOf(
    {
      Line: { name: "line.mini", match: "[a-zA-Z]+\\n" },
      Tail: {
        name: "tail.mini",
        begin: "(?<=X\\n)",
        end: "^(?=Stop)",
        patterns: [{ include: "#Label" }, { include: "#Gap" }],
      },
      Mark: { name: "mark.mini", match: "(?<=Y\\n)" },
    },
    [{ include: "#Line" }, { include: "#Tail" }, { include: "#Mark" }, { include: "#Word" }, { include: "#Gap" }],
  );
  const parser = new TextmateGrammarParser(structuredClone(grammar) as never);
  const PAD = "aa\n".repeat(30);

  const edit = (text: string, from: number, to: number, insert: string) => {
    const before = parser.parse(text);
    const next = `${text.slice(0, from)}${insert}${text.slice(to)}`;
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [
      { fromA: from, toA: to, fromB: from, toB: from + insert.length },
    ]);
    return { next, tree: parser.parse(next, fragments) };
  };

  test.each([
    ["removing what opens a rule", "aX\n", "a\n"],
    ["adding what opens a rule", "a\n", "aX\n"],
    ["removing what matches an empty mark", "aY\n", "a\n"],
    ["adding what matches an empty mark", "a\n", "aY\n"],
  ])("%s gives the cold parse's tree", async (_, line, edited) => {
    const text = `${PAD}${line}Label\nLabel\nStop\n${PAD}`;
    const at = PAD.length + 1;
    const { next, tree } = edit(text, at, at + line.length - 2, edited.slice(1, -1));
    expect(next).toBe(`${PAD}${edited}Label\nLabel\nStop\n${PAD}`);
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    expect(treeScopes(grammar, text), "the original text scopes as vscode-textmate does").toEqual(vscode);
    expect(printTree(tree, next)).toBe(printTree(parser.parse(next), next));
  });
});
