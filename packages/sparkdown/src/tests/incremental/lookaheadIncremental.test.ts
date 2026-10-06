// An operator at the end of a line is read as missing its operand or not by
// a lookahead into the lines after it, past blank lines and comments, to the
// next token. An edit to that token has to reparse the operator's line too,
// or the incremental tree keeps the node the old text gave it (#1580).

import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { SparkdownDocument } from "../../compiler/classes/SparkdownDocument";
import { getParser } from "../compiler/grammarSnapshot";
import { applyEdit, type Edit, editAndReparse, replaceEdit } from "./incremental";

// Inserts `insert` `offset` characters into the first `find`.
const insertEdit = (src: string, find: string, offset: number, insert: string): Edit => {
  const at = src.indexOf(find);
  if (at < 0) throw new Error(`insertEdit: ${JSON.stringify(find)} not found`);
  return { from: at + offset, to: at + offset, insert };
};

// The parse reuses nothing before an edit fewer than 128 characters into the
// document (`TreeFragment.applyChanges` drops shorter fragments), so the
// scripts start with enough story lines to be reused.
const PREFIX = "  Plain line.\n".repeat(12);

const source = (between: string, next = "  local r = 1") => `${PREFIX}  local q =${between}
${next}
  Plain line.
`;

// Splits `  local r = 1` after its `l`.
const split = (s: string) => insertEdit(s, "  local r", 3, "\n");

const CASES: [string, string, (src: string) => Edit][] = [
  ["split the next statement's keyword", source(""), split],
  ["finish a keyword on the next line", source("", "  l"), (s) => insertEdit(s, "  l\n  Plain", 3, "ocal r = 1")],
  ["split the keyword after blank lines", source("\n\n\n"), split],
  ["split the keyword after comment lines", source("\n  -- note\n  -- more\n  -- most"), split],
  ["split the keyword after a comment that spans lines", source("\n--[[ a\nb\n]]"), split],
  ["split the keyword after a comment that opens on the operator's line", source(" --[[ a\nb ]]"), split],
  ["delete the next statement", source(""), (s) => replaceEdit(s, "  local r = 1\n", "")],
  // The edit is inside the comment, whose close is still ahead of it.
  ["close a comment that spans lines from inside it", source("\n--[[ a\nb\nc\nd\ne\nf\n]]"), (s) => replaceEdit(s, "\ne\n", "\n]] l\n")],
];

describe("incremental reparse of an operator whose operand is read from a later line", () => {
  test.each(CASES)("%s", (_name, source, edit) => {
    const r = editAndReparse(source, edit(source));
    expect(r.identical, r.diff).toBe(true);
  });

  const FUNCTION_SOURCE = `${PREFIX}function f()
  local q =
  -- note
  -- more
  -- most
  local r = 1
  return r
end
`;
  // The first edit inside a block reparses the whole block and leaves a
  // restart point at each of its lines; the second restarts inside it.
  test("split the keyword inside a function body", () => {
    const parser = getParser();
    const first = insertEdit(FUNCTION_SOURCE, "  return r", 10, " ");
    const edited = applyEdit(FUNCTION_SOURCE, first);
    const tree = parser.parse(
      edited,
      TreeFragment.applyChanges(TreeFragment.addTree(parser.parse(FUNCTION_SOURCE)), [
        { fromA: first.from, toA: first.to, fromB: first.from, toB: first.from + first.insert.length },
      ]),
    );
    const second = split(edited);
    const final = applyEdit(edited, second);
    const incremental = parser.parse(
      final,
      TreeFragment.applyChanges(TreeFragment.addTree(tree), [
        { fromA: second.from, toA: second.to, fromB: second.from, toB: second.from + second.insert.length },
      ]),
    );
    expect(printTree(incremental, final)).toBe(printTree(parser.parse(final), final));
  });

  // The compiler's document serves the parser its text in slices, and a
  // lookahead sees the end of the input where the last slice read ends. A
  // parse that restarts just before a slice end has to see it end where a
  // parse from the start does: here the operator's line ends the first
  // slice, so neither parse reads the line after it.
  test("finish a keyword after the operator's line ends a slice of the document", () => {
    const parser = getParser();
    const before = "  Plain line.\n".repeat(1170) + "  local q =\n  l\n  Plain line.\n";
    const edit = insertEdit(before, "  l\n  Plain", 3, "ocal r = 1");
    const after = applyEdit(before, edit);
    const document = (text: string) => new SparkdownDocument("inmemory:///main.sd", "sparkdown", 1, text);
    const incremental = parser.parse(
      document(after),
      TreeFragment.applyChanges(TreeFragment.addTree(parser.parse(document(before))), [
        { fromA: edit.from, toA: edit.to, fromB: edit.from, toB: edit.from + edit.insert.length },
      ]),
    );
    expect(printTree(incremental, after)).toBe(printTree(parser.parse(document(after)), after));
  });
});
