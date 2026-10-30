import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { SparkdownDocument } from "../../compiler/classes/SparkdownDocument";
import { getParser } from "../compiler/grammarSnapshot";
import { applyEdit, type Edit, editAndReparse, replaceEdit } from "./incremental";

const insertEdit = (src: string, find: string, offset: number, insert: string): Edit => {
  const at = src.indexOf(find);
  if (at < 0) throw new Error(`insertEdit: ${JSON.stringify(find)} not found`);
  return { from: at + offset, to: at + offset, insert };
};

const PREFIX = "  Plain line.\n".repeat(12);

const source = (between: string, next = "  local r = 1") => `${PREFIX}  local q =${between}
${next}
  Plain line.
`;

const split = (s: string) => insertEdit(s, "  local r", 3, "\n");

const CASES: [string, string, (src: string) => Edit][] = [
  ["split the next statement's keyword", source(""), split],
  ["finish a keyword on the next line", source("", "  l"), (s) => insertEdit(s, "  l\n  Plain", 3, "ocal r = 1")],
  ["split the keyword after blank lines", source("\n\n\n"), split],
  ["split the keyword after comment lines", source("\n  -- note\n  -- more\n  -- most"), split],
  ["split the keyword after a comment that spans lines", source("\n--[[ a\nb\n]]"), split],
  ["split the keyword after a comment that opens on the operator's line", source(" --[[ a\nb ]]"), split],
  ["delete the next statement", source(""), (s) => replaceEdit(s, "  local r = 1\n", "")],
  ["close a comment that spans lines from inside it", source("\n--[[ a\nb\nc\nd\ne\nf\n]]"), (s) => replaceEdit(s, "\ne\n", "\n]] l\n")],
  ["type on a blank line under blank lines from the document's start", "\n" + "  \n".repeat(100) + "  local q =\n  local r = 1\n", (s) => insertEdit(s, "  \n  local q", 0, " ")],
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
