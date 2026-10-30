import { ResumableTokenizer } from "@impower/textmate-grammar-tree/src/grammar/classes/ResumableTokenizer";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { describe, expect, test, vi } from "vitest";
import { treeScopes, vscodeScopes } from "./engineScopes";

const FIRST = "first.mini";

const grammarOf = (
  repository: Record<string, unknown>,
  patterns = [{ include: "#Block" }, { include: "#Word" }, { include: "#Gap" }],
) => ({
  name: "mini",
  scopeName: "source.mini",
  patterns,
  repository: {
    Word: { name: "word.mini", match: "[a-z]+" },
    Gap: { match: "\\s" },
    ...repository,
  },
});

const firstWord = () => ({ name: FIRST, match: "\\G[a-z]+" });

const GRAMMARS = {
  keyword: grammarOf({
    Block: {
      name: "block.mini",
      begin: "do\\b[ ]*",
      end: "\\bend\\b",
      patterns: [{ include: "#First" }, { include: "#Word" }, { include: "#Gap" }],
    },
    First: firstWord(),
  }),
  restoredAfterChild: grammarOf({
    Block: {
      name: "block.mini",
      begin: "<",
      end: ">",
      patterns: [{ include: "#Paren" }, { include: "#First" }, { include: "#Word" }, { include: "#Gap" }],
    },
    Paren: { name: "paren.mini", begin: "\\(", end: "\\)", patterns: [{ include: "#Word" }] },
    First: firstWord(),
  }),
  zeroWidthChild: grammarOf({
    Block: {
      name: "block.mini",
      begin: "<",
      end: ">",
      patterns: [{ include: "#Mark" }, { include: "#First" }, { include: "#Word" }, { include: "#Gap" }],
    },
    Mark: { name: "mark.mini", begin: "(?=!)", end: "!" },
    First: firstWord(),
  }),
  childEndsAtItsBegin: grammarOf({
    Block: {
      name: "block.mini",
      begin: "<",
      end: ">",
      patterns: [{ include: "#Open" }, { include: "#First" }, { include: "#Word" }, { include: "#Gap" }],
    },
    Open: { name: "open.mini", begin: "\\(", end: "(?=[a-z])" },
    First: firstWord(),
  }),
  capturedLineBreak: grammarOf({
    Block: {
      name: "block.mini",
      begin: "^do[ ]*\\n",
      end: "^end\\b",
      patterns: [{ include: "#Inner" }, { include: "#First" }, { include: "#Word" }, { include: "#Gap" }],
    },
    Inner: { name: "inner.mini", begin: "\\[", end: "\\]", patterns: [{ include: "#Word" }] },
    First: firstWord(),
  }),
  anchoredEnd: grammarOf({
    Block: {
      name: "block.mini",
      begin: "\\{",
      end: "\\G!|;",
      patterns: [{ include: "#Word" }, { name: "bang.mini", match: "!" }, { include: "#Gap" }],
    },
  }),
  escapedBackslash: grammarOf(
    { Literal: { name: "literal.mini", match: "\\\\G" } },
    [{ include: "#Literal" }, { include: "#Word" }, { include: "#Gap" }],
  ),
};

const CASES: [keyof typeof GRAMMARS, string, string | null][] = [
  ["keyword", "do aa bb end\n", "aa"],
  ["keyword", "do   aa end\n", "aa"],
  ["keyword", "xx do aa end\n", "aa"],
  ["keyword", "aa do\nbb end\n", null],
  ["keyword", "do\naa end\n", null],
  ["restoredAfterChild", "<aa(bb)cc>\n", "aa"],
  ["restoredAfterChild", "<(bb)cc>\n", null],
  ["zeroWidthChild", "<!aa>\n", null],
  ["childEndsAtItsBegin", "<aa (bb>\n", "aa"],
  ["childEndsAtItsBegin", "<(bb>\n", null],
  ["capturedLineBreak", "do\naa bb\ncc\n[dd]ee\nend\n", "aa"],
  ["capturedLineBreak", "do  \naa\n", "aa"],
  ["capturedLineBreak", "do x\naa\n", null],
  ["anchoredEnd", "{!a!;\n", null],
  ["anchoredEnd", "{a!b;\n", null],
  ["escapedBackslash", "a\\Gb\n", null],
];

describe("textmate-grammar-tree reads `\\G` as vscode-textmate does (I-1813)", () => {
  test.each(CASES)("%s: %j", async (name, text, anchored) => {
    const grammar = GRAMMARS[name];
    const vscode = await vscodeScopes(structuredClone(grammar), text);
    if (anchored != null) {
      const at = text.indexOf(anchored);
      expect(vscode[at]!.split(" "), "the case exercises an anchored match").toContain(FIRST);
    }
    expect(treeScopes(grammar, text)).toEqual(vscode);
  });

  test("a begin that takes its line break anchors the start of each line it stays open over", async () => {
    const text = "do\naa bb\ncc\n[dd]ee\nend\n";
    const vscode = await vscodeScopes(structuredClone(GRAMMARS.capturedLineBreak), text);
    const firsts = [...text].flatMap((_, i) => (vscode[i]!.split(" ").includes(FIRST) ? [i] : []));
    expect(firsts.map((i) => text[i]).join("")).toBe("aacc");
    expect(treeScopes(GRAMMARS.capturedLineBreak, text)).toEqual(vscode);
  });
});

describe("an incremental parse restores the `\\G` anchor (I-1813)", () => {
  const parser = new TextmateGrammarParser(
    grammarOf(
      {
        Block: {
          name: "block.mini",
          begin: "^do[ ]*\\n",
          end: "^end\\b",
          patterns: [{ include: "#First" }, { include: "#Word" }, { include: "#Space" }, { include: "#Newline" }],
        },
        First: firstWord(),
        Space: { name: "space.mini", match: " " },
        Newline: { name: "newline.mini", match: "\\n" },
      },
      [{ include: "#Block" }, { include: "#Word" }, { include: "#Space" }, { include: "#Newline" }],
    ) as never,
  );

  const PAD = "aa bb\n".repeat(20);
  const BODY = "aa bb cc dd ee ff gg hh ii jj kk ll mm nn oo pp qq rr ss tt uu vv ww xx yy zz\n".repeat(6);
  const TEXT = `${PAD}do\n${BODY}end\naa bb\ndo x\n${BODY}end\n`;
  const BLOCK = PAD.length;

  const insert = (text: string, at: number, before: Tree) => {
    const next = `${text.slice(0, at)}z${text.slice(at)}`;
    const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before), [
      { fromA: at, toA: at, fromB: at, toB: at + 1 },
    ]);
    return { next, tree: parser.parse(next, fragments) };
  };

  test("matches a cold parse for a second edit inside the block", () => {
    const first = insert(TEXT, BLOCK + 4, parser.parse(TEXT));
    const restore = vi.spyOn(ResumableTokenizer.prototype, "restore");
    const mismatches: number[] = [];
    try {
      for (let at = BLOCK + 90; at < first.next.length; at += 7) {
        const second = insert(first.next, at, first.tree);
        if (printTree(second.tree, second.next) !== printTree(parser.parse(second.next), second.next)) {
          mismatches.push(at);
        }
      }
      const anchoredRestores = restore.mock.calls.filter(([resume]) =>
        resume.stack.some((frame) => frame.beginCapturedLineBreak),
      );
      expect(anchoredRestores.length, "some edits resume inside the block").toBeGreaterThan(0);
    } finally {
      restore.mockRestore();
    }
    expect(mismatches).toEqual([]);
  });

  test("anchors the first word of each line of a block opened by a line break, and none of a block that is not", () => {
    const printed = printTree(parser.parse(TEXT), TEXT);
    expect(printed.match(/\bFirst\b/g)?.length).toBe(6);
  });
});
