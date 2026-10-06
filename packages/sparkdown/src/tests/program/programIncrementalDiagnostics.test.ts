import "../../inkjs/engine/Container";
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

function compareAfterEdit(
  before: string,
  edit: { line: number; character: number; text: string },
  programChunks: boolean,
) {
  const c = programCompiler({ [MAIN_URI]: before }, { programChunks });
  c.compile();
  c.compiler.updateDocument({
    textDocument: { uri: MAIN_URI, version: 2 },
    contentChanges: [
      {
        range: {
          start: { line: edit.line, character: edit.character },
          end: { line: edit.line, character: edit.character },
        },
        text: edit.text,
      },
    ],
  });
  const lines = before.split("\n");
  const offset = lines.slice(0, edit.line).reduce((n, l) => n + l.length + 1, 0) + edit.character;
  const after = before.slice(0, offset) + edit.text + before.slice(offset);
  const incremental = diagnostics(c.compile().program);
  const cold = new SparkdownCompiler();
  cold.configure({
    files: [{ uri: MAIN_URI, type: "script", name: "main", ext: "sd", text: after, version: 1, languageId: "sparkdown" }] as never,
    programChunks,
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

  for (const programChunks of [true, false]) {
    it(`reports a value missing after = where a cold compile does (programChunks=${programChunks})`, () => {
      const { incremental, cold } = compareAfterEdit(BEFORE, { line: 8, character: 3, text: "\n" }, programChunks);
      expect(cold).toContain("7:10-7:11 Expected identifier when parsing expression, got 'l'");
      expect(incremental).toEqual(cold);
    });
  }
});
