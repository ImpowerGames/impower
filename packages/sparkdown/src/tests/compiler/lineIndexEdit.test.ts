// #1745: the Luau readers turn offsets into lines through an index of the
// document's line starts. After an edit, that index must not be rebuilt by
// scanning the whole document for newlines, or every keystroke in a long
// script pays for the whole script; and the positions it gives must be the
// ones a fresh scan gives.
import { expect, test, vi } from "vitest";
import { luauPositionOffset, noteLuauDocumentEdit, readLuauExpressionAfter } from "../../compiler/typecheck/readLuauAst";

// An index of an empty document makes the next lookup index its document from scratch.
const forget = () => luauPositionOffset({ line: 0, column: 0 } as never, "");

/** How many newline searches a lookup in `edited` makes over `edited`, after one in `source`. */
function newlineScansAfterEdit(lines: number) {
  const source = `${"local a = 1\n".repeat(lines)}local x = value\n`;
  forget();
  luauPositionOffset({ line: 0, column: 0 } as never, source);
  // An edit near the end that inserts a line.
  const at = source.length - "value\n".length;
  const edited = `${source.slice(0, at)}(\n${source.slice(at)}`;
  noteLuauDocumentEdit(source, edited, at, at, at + 2);
  let scans = 0;
  const indexOf = String.prototype.indexOf;
  const spy = vi.spyOn(String.prototype, "indexOf").mockImplementation(function (this: string, search: string, position?: number) {
    if (search === "\n" && this.length === edited.length) scans++;
    return indexOf.call(this, search, position);
  });
  try {
    expect(luauPositionOffset({ line: lines + 1, column: 0 } as never, edited)).toBe(edited.lastIndexOf("value"));
  } finally {
    spy.mockRestore();
  }
  return scans;
}

test("an edit does not scan the whole document for its line starts", () => {
  const long = newlineScansAfterEdit(1000);
  const longer = newlineScansAfterEdit(4000);
  console.log("newline scans after an edit", JSON.stringify({ long, longer }));
  expect(longer).toBeLessThanOrEqual(long);
  expect(longer).toBeLessThan(20);
});

/** Every line's start offset, and an expression's reading, as `text` gives them. */
function positionsOf(text: string) {
  const lines = text.split("\n").length;
  const starts = Array.from({ length: lines + 1 }, (_, line) => luauPositionOffset({ line, column: 0 } as never, text));
  const from = text.indexOf("value");
  const read = from < 0 ? undefined : readLuauExpressionAfter(from - 1, text);
  return { starts, location: read && JSON.stringify(read.expr.location), errors: read && JSON.stringify(read.errors) };
}

test("positions after an edit to and from an empty document are those of a fresh scan", () => {
  const text = "a\n\nlocal y =\n  value\n";
  forget();
  for (const [before, after] of [
    [text, ""],
    ["", text],
    [text, "\n"],
    ["\n", text],
  ]) {
    positionsOf(before!);
    // The edit as narrow as these texts allow: what both begin and end with is kept.
    let from = 0;
    while (from < Math.min(before!.length, after!.length) && before![from] === after![from]) from++;
    let suffix = 0;
    while (suffix < Math.min(before!.length, after!.length) - from && before![before!.length - suffix - 1] === after![after!.length - suffix - 1]) suffix++;
    noteLuauDocumentEdit(before!, after!, from, before!.length - suffix, after!.length - suffix);
    const edited = positionsOf(after!);
    forget();
    expect(edited, JSON.stringify([before, after])).toEqual(positionsOf(after!));
  }
});

test("positions after edits that insert and remove newlines are those of a fresh scan", () => {
  // A small fixed generator, so a failure reproduces.
  let seed = 1745;
  const random = (n: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed % n;
  };
  const pieces = ["\n", "\n\n", "x", "-- c\n", "", "ab\ncd", "\r\n"];
  let text = "local h = 1\n\nlocal y =\n  value + 1\n";
  forget();
  positionsOf(text);
  for (let i = 0; i < 400; i++) {
    // Edits anywhere before the expression, inside the first line, at the
    // document's end, and replacements across several lines.
    const shape = random(4);
    const end = text.indexOf("value");
    let from: number;
    let to: number;
    if (shape === 0) from = to = random(text.indexOf("\n") + 1);
    else if (shape === 1) from = to = text.length;
    else {
      from = random(end + 1);
      to = Math.min(from + random(12), end);
    }
    if (to < from) to = from;
    const insert = pieces[random(pieces.length)]! + (shape === 3 ? pieces[random(pieces.length)]! : "");
    const before = text;
    text = text.slice(0, from) + insert + text.slice(to);
    // As the registry notes each change it applies (#1750).
    noteLuauDocumentEdit(before, text, from, to, from + insert.length);
    if (!text.includes("value")) {
      const unvalued = text;
      text += "\nlocal y = value\n";
      noteLuauDocumentEdit(unvalued, text, unvalued.length, unvalued.length, text.length);
    }
    const edited = positionsOf(text);
    forget();
    // The fresh scan's index is the one the next edit starts from.
    expect(edited, `after edit ${i}`).toEqual(positionsOf(text));
  }
});
