// A collapsed structural list item (`- eyes:`) opens two nesting levels on one
// line: the item at the dash column and its first entry at the column that
// entry starts in. The formatter recovers a struct body's nesting from indent
// widths alone, so these cases pin the two paths the fixture snapshots do not
// reach: tab-indented input, and the incremental (delta) format-on-save path.

import { Text } from "@codemirror/state";
import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { SparkdownCombinedAnnotator } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { TextEdit } from "vscode-languageserver";
import { describe, expect, test } from "vitest";
import { getDocumentFormattingEdits } from "../../utils/providers/getDocumentFormattingEdits";

let cachedParser: TextmateGrammarParser | undefined;
function getParser(): TextmateGrammarParser {
  if (!cachedParser) {
    cachedParser = new TextmateGrammarParser(GRAMMAR_DEFINITION as any);
  }
  return cachedParser;
}

const OPTIONS = {
  tabSize: 2,
  insertSpaces: true,
  trimTrailingWhitespace: true,
  insertFinalNewline: true,
  trimFinalNewlines: true,
};

// Format `source`; with `dirtyRange`, through the incremental (delta) path.
function format(
  source: string,
  dirtyRange?: { from: number; to: number },
): string {
  const tree = getParser().parse(source);
  const doc = new SparkdownDocument("test://f.sd", "sparkdown", 1, source);
  const annotators = new SparkdownCombinedAnnotator();
  annotators.create(tree, Text.of(source.split("\n")));
  const edits = getDocumentFormattingEdits(
    doc,
    tree,
    annotators.get(),
    OPTIONS,
    undefined,
    undefined,
    dirtyRange,
  ) as TextEdit[] | undefined;
  if (!edits || edits.length === 0) return source;
  let result = source;
  for (const edit of [...edits].sort(
    (a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start),
  )) {
    result =
      result.slice(0, doc.offsetAt(edit.range.start)) +
      edit.newText +
      result.slice(doc.offsetAt(edit.range.end));
  }
  return result;
}

const CANONICAL = `animation blink with
  keyframes:
    - eyes:
        option = open
      offset = 0
    - eyes:
        option = closed
      eyebrows:
        translate = 0 6%
      offset = 0.4
end
`;

describe("collapsed list item formatting", () => {
  test("the canonical collapsed form is left unchanged", () => {
    expect(format(CANONICAL)).toBe(CANONICAL);
  });

  test("tab-indented input normalizes to the canonical form, idempotently", () => {
    // One tab per level. The inline entry starts two characters after its
    // dash, so the item's remaining entries sit at that column and the
    // entry's own children one tab further in.
    const tabbed =
      "animation blink with\n" +
      "\tkeyframes:\n" +
      "\t\t- eyes:\n" +
      "\t\t\t\toption = open\n" +
      "\t\t  offset = 0\n" +
      "\t\t- eyes:\n" +
      "\t\t\t\toption = closed\n" +
      "\t\t  eyebrows:\n" +
      "\t\t\t\ttranslate = 0 6%\n" +
      "\t\t  offset = 0.4\n" +
      "end\n";
    const once = format(tabbed);
    expect(once).toBe(CANONICAL);
    expect(format(once)).toBe(once);
  });

  const CORRUPTIONS: [string, number, (line: string) => string][] = [
    ["inline entry's child over-indented", 3, (l) => "            " + l.trim()],
    ["hanging entry under-indented", 4, (l) => "     " + l.trim()],
    ["trailing whitespace on a collapsed dash line", 5, (l) => l + "   "],
  ];

  for (const [label, lineIndex, mutate] of CORRUPTIONS) {
    test(`delta format matches full format: ${label}`, () => {
      const lines = CANONICAL.split("\n");
      const from = lines.slice(0, lineIndex).join("\n").length + 1;
      lines[lineIndex] = mutate(lines[lineIndex]!);
      const source = lines.join("\n");
      const full = format(source);
      expect(full).toBe(CANONICAL);
      expect(
        format(source, { from, to: from + lines[lineIndex]!.length }),
      ).toBe(full);
    });
  }
});
