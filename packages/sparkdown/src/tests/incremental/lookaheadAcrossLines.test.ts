// A pattern tried on one line can read on into the lines below it. An edit
// on a later line can then change what that pattern decided, and the
// incremental tree has to come out as a parse from the start does (#1583).

import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { TreeFragment } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { SparkdownDocument } from "../../compiler/classes/SparkdownDocument";
import { getParser } from "../compiler/grammarSnapshot";
import { applyEdit, type Edit, replaceEdit } from "./incremental";

// The parse reuses nothing before an edit fewer than 128 characters into the
// document (`TreeFragment.applyChanges` drops shorter fragments), so the
// scripts start with enough story lines to be reused.
const PREFIX = "  Plain line.\n".repeat(20);

const change = (edit: Edit) => ({
  fromA: edit.from,
  toA: edit.to,
  fromB: edit.from,
  toB: edit.from + edit.insert.length,
});

// Parses `source`, then applies each edit in turn and reparses with the
// previous tree's fragments. Returns the last text and its incremental tree.
const editInTurn = (
  read: (text: string) => string | SparkdownDocument,
  source: string,
  edits: ((text: string) => Edit)[],
) => {
  const parser = getParser();
  let text = source;
  let tree = parser.parse(read(text));
  for (const makeEdit of edits) {
    const edit = makeEdit(text);
    text = applyEdit(text, edit);
    tree = parser.parse(read(text), TreeFragment.applyChanges(TreeFragment.addTree(tree), [change(edit)]));
  }
  return { text, tree, cold: parser.parse(read(text)) };
};

const fromString = (text: string) => text;
const fromDocument = (text: string) => new SparkdownDocument("inmemory:///main.sd", "sparkdown", 1, text);

const MATCH_SOURCE = `${PREFIX}  match (a
b
c
d
e) | A | B
  Plain line.
`;

// The first edit leaves restart points in the prefix, so the second
// restarts after the opening line instead of from the document's start.
const touchPrefix = (s: string) => replaceEdit(s, "  Plain line.", "  Plain lines.");

// `opening` leaves something unclosed; the edit closes it on `last`, the
// third line below it.
const closedThreeLinesBelow = (
  name: string,
  opening: string,
  [first, second, last]: [string, string, string],
  closed: string,
): [string, string, ((text: string) => Edit)[]] => [
  name,
  `${PREFIX}${opening}\n${first}\n${second}\n${last}\n  Plain line.\n`,
  [touchPrefix, (s) => replaceEdit(s, last, closed)],
];

const CASES: [string, string, ((text: string) => Edit)[]][] = [
  // The header's `|` is four lines below the `match`.
  ["a match header loses the bar after its condition", MATCH_SOURCE, [touchPrefix, (s) => replaceEdit(s, "e) |", "e) +")]],
  [
    "a match header gains a bar after its condition",
    MATCH_SOURCE.replace("e) |", "e) +"),
    [touchPrefix, (s) => replaceEdit(s, "e) +", "e) |")],
  ],
  closedThreeLinesBelow("a choice's condition", "+ (abc", ["  First.", "  Second.", "  Third."], "  Third.)"),
  closedThreeLinesBelow("a text command", "Hello <wait", ["First.", "Second.", "Third."], "Third>"),
  closedThreeLinesBelow("a parenthetical line", "HERO:\n  (whis", ["  First.", "  Second.", "  Third."], "  Third.)"),
  closedThreeLinesBelow("an image command", "[[show bg", ["First.", "Second.", "Third."], "Third.]]"),
  closedThreeLinesBelow("an audio command", "((play music", ["First.", "Second.", "Third."], "Third.))"),
  closedThreeLinesBelow("a choice's conditions", "+ Choice\n{a", ["b", "c", "d"], "d}"),
  closedThreeLinesBelow(
    "a choose block's then clause",
    "scene main\n  choose\n    * Hi\n  then (greet",
    ["    a", "    b", "    c"],
    "    c)",
  ),
  closedThreeLinesBelow("a rich text tag", 'Go <color="red', ["First.", "Second.", "Third."], 'Third.">x'),
];

describe("incremental reparse of a pattern that reads on past its line", () => {
  describe.each([
    ["a string", fromString],
    ["the compiler's document", fromDocument],
  ] as const)("parsed from %s", (_input, read) => {
    test.each(CASES)("%s", (_name, source, edits) => {
      const { text, tree, cold } = editInTurn(read, source, edits);
      expect(printTree(tree, text)).toBe(printTree(cold, text));
    });
  });
});
