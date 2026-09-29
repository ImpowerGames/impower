import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { expect, test } from "vitest";
import { resolveFormattingConflicts } from "../../utils/providers/getDocumentFormattingEdits";

// `resolveFormattingConflicts` folds quote rewrites in after the other
// edits are resolved: an edit touching a rewrite is joined to it, and an
// edit overlapping it gives way.

const source = "local s = 'x'  .. 'y'\n";
const doc = new SparkdownDocument("test://fold.sd", "sparkdown", 1, source);

function edit(from: number, to: number, newText: string, type: string) {
  return {
    range: { start: doc.positionAt(from), end: doc.positionAt(to) },
    newText,
    type,
  };
}

function apply(edits: ReturnType<typeof resolveFormattingConflicts>) {
  let text = source;
  for (const e of [...edits].sort(
    (a, b) => doc.offsetAt(b.range.start) - doc.offsetAt(a.range.start),
  )) {
    text =
      text.slice(0, doc.offsetAt(e.range.start)) +
      e.newText +
      text.slice(doc.offsetAt(e.range.end));
  }
  return text;
}

test("whitespace edits at one boundary are merged before a quote rewrite joins them", () => {
  const resolved = resolveFormattingConflicts(
    [
      edit(10, 13, '"x"', "quote_normalize"),
      edit(13, 15, "", "separator"),
      edit(15, 15, " ", "keyword_separator"),
      edit(18, 21, '"y"', "quote_normalize"),
    ],
    doc,
  );
  expect(apply(resolved)).toBe('local s = "x" .. "y"\n');
  expect(resolved).toHaveLength(2);
});

test("an edit overlapping a quote rewrite gives way to it", () => {
  const resolved = resolveFormattingConflicts(
    [
      edit(10, 13, '"x"', "quote_normalize"),
      edit(11, 12, "z", "separator"),
    ],
    doc,
  );
  expect(apply(resolved)).toBe("local s = \"x\"  .. 'y'\n");
  expect(resolved).toHaveLength(1);
});

test("edits away from a quote rewrite are kept in order", () => {
  const resolved = resolveFormattingConflicts(
    [
      edit(5, 6, "  ", "separator"),
      edit(18, 21, '"y"', "quote_normalize"),
      edit(21, 21, " ", "trailing"),
    ],
    doc,
  );
  expect(apply(resolved)).toBe("local  s = 'x'  .. \"y\" \n");
  expect(resolved.map((e) => doc.offsetAt(e.range.start))).toEqual([5, 18]);
});
