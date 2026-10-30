import { expect, test, vi } from "vitest";
import { luauPositionOffset, noteLuauDocumentEdit, readLuauExpressionAfter } from "../../compiler/typecheck/readLuauAst";

const forget = () => luauPositionOffset({ line: 0, column: 0 } as never, "");

function newlineScansAfterEdit(lines: number) {
  const source = `${"local a = 1\n".repeat(lines)}local x = value\n`;
  forget();
  luauPositionOffset({ line: 0, column: 0 } as never, source);
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
    noteLuauDocumentEdit(before, text, from, to, from + insert.length);
    if (!text.includes("value")) {
      const unvalued = text;
      text += "\nlocal y = value\n";
      noteLuauDocumentEdit(unvalued, text, unvalued.length, unvalued.length, text.length);
    }
    const edited = positionsOf(text);
    forget();
    expect(edited, `after edit ${i}`).toEqual(positionsOf(text));
  }
});
