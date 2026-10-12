import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { MAIN_URI, programCompiler } from "./programHarness";

// An incremental compile reports the same diagnostics as a cold compile of
// the same text, whatever edit led to it (#1580).

const diagnostics = (program: any) =>
  Object.values(program.diagnostics ?? {})
    .flat()
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message?.value;
      return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${message}`;
    })
    .sort();

const position = (text: string, offset: number) => {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines.at(-1)!.length };
};

// Replaces `from`-`to` of `before` with `text`, through an incremental
// update and through a cold compile of the result.
function compareAfterEdit(
  before: string,
  edit: { from: number; to: number; text: string },
) {
  const c = programCompiler({ [MAIN_URI]: before });
  c.compile();
  c.compiler.updateDocument({
    textDocument: { uri: MAIN_URI, version: 2 },
    contentChanges: [
      {
        range: { start: position(before, edit.from), end: position(before, edit.to) },
        text: edit.text,
      },
    ],
  });
  const after = before.slice(0, edit.from) + edit.text + before.slice(edit.to);
  const incremental = diagnostics(c.compile().program);
  const cold = new SparkdownCompiler();
  cold.configure({
    files: [{ uri: MAIN_URI, type: "script", name: "main", ext: "sd", text: after, version: 1, languageId: "sparkdown" }] as never,
  });
  return { incremental, cold: diagnostics(cold.compile({ textDocument: { uri: MAIN_URI } }).program) };
}

describe("incremental diagnostics agree with a cold compile", () => {
  // The fuzzed function screenplay (seed 12345) around the edit that splits
  // `  local q = function() return 1 end` after its `l`, leaving the
  // unfinished `  local q =` before a line `  l`.
  const BEFORE = [
    "  Plain line.",
    " & add(3)",
    "  lo... b = pair(2)",
    "  Pa(ir {a} {b}",
    "  local q-- c ",
    "  Plain line.",
    "= function...() return 1 ",
    "  local q =",
    "  local q = function() return 1 end",
    " function() return 1end",
    " end",
  ].join("\n");

  // An unfinished `local q =` before a comment that spans lines, which the
  // edit closes early, so the next token Luau reads after the `=` is `l`.
  const COMMENT_BEFORE =
    "  Plain line.\n".repeat(20) + "  local q =\n--[[ a\nb\nc\nd\ne\nf\n]]\n  local r = 1\n  return r\n";

  // A `--[[` that opens no comment (in a string, a line comment or a long
  // string) before the real comment: its first `]]` is inside the real one.
  const FALSE_OPENERS = [
    ["a quoted string", '  local s = "--[["'],
    ["a line comment", "  -- note --[["],
    ["a long string", "  local s = [==[ --[[ ]==]"],
  ];
  const falseOpenerSource = (line: string) =>
    "  Plain line.\n".repeat(20) +
    `${line}\n  local q =\n--[=[ a\nb\n]]\nc\nd\ne\nf\n]=]\n  local r = 1\n  Plain line.\n`;

  for (const [where, line] of FALSE_OPENERS) {
    it(`reports it there after a --[[ in ${where} above the comment`, () => {
      const source = falseOpenerSource(line!);
      const split = source.indexOf("  local r") + 3;
      const inside = source.indexOf("\ne\n");
      for (const edit of [
        { from: split, to: split, text: "\n" },
        { from: inside, to: inside + 3, text: "\n]=] l\n" },
      ]) {
        const { incremental, cold } = compareAfterEdit(source, edit);
        expect(cold.some((d) => d.startsWith("21:10-21:11 Expected identifier when parsing expression"))).toBe(true);
        expect(incremental).toEqual(cold);
      }
    });
  }

  it("reports a value missing after = where a cold compile does", () => {
    const at = BEFORE.indexOf("  local q = function") + 3;
    const { incremental, cold } = compareAfterEdit(BEFORE, { from: at, to: at, text: "\n" });
    expect(cold).toContain("7:10-7:11 Expected identifier when parsing expression, got 'l'");
    expect(incremental).toEqual(cold);
  });

  it("reports it there after an edit inside a comment between them", () => {
    const at = COMMENT_BEFORE.indexOf("\ne\n");
    const { incremental, cold } = compareAfterEdit(COMMENT_BEFORE, { from: at, to: at + 3, text: "\n]] l\n" });
    expect(cold.some((d) => d.startsWith("20:10-20:11 Expected identifier when parsing expression"))).toBe(true);
    expect(incremental).toEqual(cold);
  });
});
