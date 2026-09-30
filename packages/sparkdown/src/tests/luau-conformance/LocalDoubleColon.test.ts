import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";

// A `local` target annotated with a doubled colon (`local x :: number`) is
// not an annotation, and Luau rejects it; the editor must say so (#1138).

describe("a local target followed by `::`", () => {
  test.each([
    "local x :: number",
    "local x :: number;",
    "local x::number",
    "local a, b :: number",
    "local x :: number = 1",
    "const x :: number = 1",
    "local x :: number -- note",
    "function f() local x :: number end",
  ])(
    "%j reports the `::`",
    (statement) => {
      const { syntaxDiagnostics } = checkLuau(`${statement}\n`);
      const col = statement.indexOf("::");
      // Compared without the code, so the expected text holds no error name.
      expect(syntaxDiagnostics.map((d) => [d.line, d.column, d.endLine, d.endColumn, d.message])).toEqual([
        [0, col, 0, col + 2, "Expected identifier when parsing expression, got '::'"],
      ]);
    },
  );

  // A type takes in the line break after it (#1053), so a declaration that
  // ends in one spans that line break, as `local x: number` does (#1183).
  test.each([
    ["local x :: number", 1],
    ["local x :: number = 1", 0],
    ["local a, b :: number", 1],
  ] as const)(
    "%j in a narrative body stays one declaration, with no prose after it",
    (statement, lineBreak) => {
      const tree = parseSource(`${statement}\n`);
      const names: string[] = [];
      const cur = tree.cursor();
      do {
        if (cur.name === "LuauSparkdownVariableDefinition") names.push(`${cur.from}-${cur.to}`);
        if (/^(ImplicitAction|TextChunk)$/.test(cur.name)) names.push(cur.name);
      } while (cur.next());
      expect(names).toEqual([`0-${statement.length + lineBreak}`]);
    },
  );

  test.each(["local x :: number", "local a, b :: number"])(
    "%j ends at its line, so the next line is prose",
    (statement) => {
      const tree = parseSource(`${statement}\nhello\n`);
      const names: string[] = [];
      const cur = tree.cursor();
      do {
        if (/^(LuauSparkdownVariableDefinition|TextChunk)$/.test(cur.name)) names.push(`${cur.name} ${cur.from}-${cur.to}`);
      } while (cur.next());
      const next = statement.length + 1;
      expect(names).toEqual([
        `LuauSparkdownVariableDefinition 0-${next}`,
        `TextChunk ${next}-${next + "hello".length}`,
      ]);
    },
  );

  test.each(["local x: number","local x: number = 1", "local y = x :: number", "local y = (x :: number)", "local a, b = 1, x :: number", "local y: number = x :: number"])(
    "%j stays free of syntax errors",
    (statement) => {
      expect(checkLuau(`local x = 1\n${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
    },
  );
});
