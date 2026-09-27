// A diagnostic reported on an indented statement starts at the statement's
// first character, not at column 0 under its indentation, and stays on the
// statement's line. Diagnostics that carry their own position keep it.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const CHOICE_MARK = "must appear inside a `choose ... end` block";
const EMPTY_DIVERT = "Empty diverts (->) are only valid on choices";
const UNKNOWN_NAME = "Cannot find variable named `qqq`";

const scene = (body: string) =>
  `store n = 0\n-> s\nscene s\n${body}\n  Done.\n  fin\nend\n`;

const message = (d: any): string =>
  typeof d?.message === "string" ? d.message : (d?.message?.value ?? "");

// The zero-based range of every diagnostic whose message holds `fragment`, as
// [line, start character, end character].
const diagnosticRanges = (source: string, fragment: string) => {
  const uri = "file:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" },
    ],
  } as never);
  const program = compiler.compile({ textDocument: { uri } } as never).program;
  return Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d: any) => message(d).includes(fragment))
    .map((d: any) => [d.range.start.line, d.range.start.character, d.range.end.character]);
};

describe("diagnostic ranges on indented statements", () => {
  test.each([
    ["an empty divert directly in the scene", "  ->", EMPTY_DIVERT, [3, 2, 4]],
    [
      "an empty divert inside an if block",
      "  if n == 0 then\n    ->\n  end",
      EMPTY_DIVERT,
      [4, 4, 6],
    ],
    [
      "an empty divert on its own line in a queue arm",
      "  queue\n  | A\n    ->\n  | B\n  end",
      EMPTY_DIVERT,
      [5, 4, 6],
    ],
    ["a choice mark outside choose", "  * [Pick]\n    Picked.", CHOICE_MARK, [3, 2, 10]],
  ])("%s starts at the statement", (_, body, fragment, range) => {
    expect(diagnosticRanges(scene(body), fragment)).toEqual([range]);
  });

  test.each([
    ["an empty divert in a single-line queue arm", "  queue | A | -> | C end", EMPTY_DIVERT, [3, 14, 17]],
    ["an unknown name", "  & zzz = qqq", UNKNOWN_NAME, [3, 10, 13]],
  ])("%s keeps its own range", (_, body, fragment, range) => {
    expect(diagnosticRanges(scene(body), fragment)).toEqual([range]);
  });
});
