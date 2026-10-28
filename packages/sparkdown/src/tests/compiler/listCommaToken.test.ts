// The token a missing-value error after a declaration's comma names, and
// where it is reported (#1275). In a narrative body the declaration ends at
// its line, so the value is missing at the end of that line, `<eof>` to
// Luau's reading of the statement (#1907). In Luau code, a function body or
// a `.luau` file, the type checker reports the token itself, `end` or the
// end of the file.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function errors(source: string, uri = "inmemory:///main.sd"): string[] {
  const compiler = new SparkdownCompiler();
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

// A story declaration ends at its line (#1907), so Luau's reading of it meets
// its end of input at the end of that line, past any comment on it, and the
// next line is never its value.
describe("narrative body: the missing value is at the end of the comma's line", () => {
  test("a comment longer than the former scanner window does not hide the missing value", () => {
    const source = "scene s\n  local a, b = 1, --[[" + "x".repeat(5000) + "]]\n  The hero.\nend\n";
    expect(errors(source)).toEqual([`1:5024-2:0 ${missing("<eof>")}`]);
  });

  test.each([
    ["the scene's `end`", "scene s\n  local a, b = 1,\nend\n", "1:17-2:0"],
    ["a line comment, then a statement", "scene s\n  local a, b = 1,\n  -- note\n  x = 2\nend\n", "1:17-2:0"],
    ["a long-bracket comment, then a name", "scene s\n  local a, b = 1,\n  --[[ block ]] y\nend\n", "1:17-2:0"],
    [
      "a comment after the comma that runs over lines, then prose",
      "scene s\n  local a, b = 1, --[[ block\n  still ]] -- line\n  The hero.\nend\n",
      // The comment carries the declaration on to the line it closes on.
      "2:18-3:0",
    ],
  ])("%s", (_name, source, range) => {
    expect(errors(source)).toEqual([`${range} ${missing("<eof>")}`]);
  });
});

describe("Luau code: the type checker reports the token", () => {
  test("`end`", () => {
    expect(errors("function f()\n  local a, b = 1,\nend\n")).toEqual([
      `2:0-2:3 ${missing("'end'")}`,
    ]);
  });

  test("the end of the file", () => {
    expect(errors("local a, b = 1,", "inmemory:///util.luau")).toEqual([`0:15-0:15 ${missing("<eof>")}`]);
  });
});
