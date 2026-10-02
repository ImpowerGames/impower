// The token a missing-value error after a declaration's comma names, and
// where it is reported (#1275). In a narrative body the declaration ends at
// its line, and Sparkdown reports the comma, naming the token Luau reads in
// place of the value: past a line comment, past a long-bracket comment
// (which the story reads as an image), the scene's `end`, or the next word.
// In Luau code the type checker reports the token itself, `end` or the end
// of the file.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function errors(source: string): string[] {
  const compiler = new SparkdownCompiler();
  const uri = "inmemory:///main.sd";
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const program = compiler.compile({ textDocument: { uri } }).program;
  return Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d: any) => d.severity === 1)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      const { start, end } = d.range;
      return `${start.line}:${start.character}-${end.line}:${end.character} ${message}`;
    });
}

const missing = (got: string) => `Expected identifier when parsing expression, got ${got}`;

describe("narrative body: the comma is reported with the token after it", () => {
  test.each([
    ["the scene's `end`", "scene s\n  local a, b = 1,\nend\n", "'end'"],
    ["a line comment, then a statement", "scene s\n  local a, b = 1,\n  -- note\n  x = 2\nend\n", "'x'"],
    ["a long-bracket comment, then a name", "scene s\n  local a, b = 1,\n  --[[ block ]] y\nend\n", "'y'"],
    [
      "a comment after the comma that runs over lines, then prose",
      "scene s\n  local a, b = 1, --[[ block\n  still ]] -- line\n  The hero.\nend\n",
      "'The'",
    ],
  ])("%s", (_name, source, got) => {
    expect(errors(source)).toEqual([`1:16-1:17 ${missing(got)}`]);
  });
});

describe("Luau code: the type checker reports the token", () => {
  test("`end`", () => {
    expect(errors("function f()\n  local a, b = 1,\nend\n")).toEqual([
      `2:0-2:3 ${missing("'end'")}`,
    ]);
  });

  test("the end of the file", () => {
    expect(errors("local a, b = 1,")).toEqual([`0:15-0:15 ${missing("<eof>")}`]);
  });
});
