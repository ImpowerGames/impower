import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic, inDiagnosticOrder, luauSyntaxErrors } from "./typecheckTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";

// A `local` target annotated with a doubled colon (`local x :: number`) is
// not an annotation, and Luau rejects it; the editor must say so (#1138),
// with the errors of Luau's recovery after it (I-1322).

describe("a local target followed by `::`", () => {
  test.each([
    "local x :: number",
    "local x :: number;",
    "local x::number",
    "local a, b :: number",
    "local x :: number = 1",
    "local x :: number -- note",
    "function f() local x :: number end",
  ])(
    "%j reports the `::`",
    (statement) => {
      const { syntaxDiagnostics, diagnostics } = checkLuau(`${statement}\n`);
      const col = statement.indexOf("::");
      // Compared without the code, so the expected text holds no error name.
      expect(syntaxDiagnostics.map((d) => [d.line, d.column, d.endLine, d.endColumn, d.message])).toContainEqual(
        [0, col, 0, col + 2, "Expected identifier when parsing expression, got '::'"],
      );
      expect(inDiagnosticOrder(syntaxDiagnostics)).toEqual(luauSyntaxErrors(diagnostics));
    },
  );

  // A `const` of Luau's (here a Luau unit's) with no value before its `::`
  // has no initializer either, which both official parsers report on the
  // declaration before the `::` (#1319).
  test("\"const x :: number = 1\" reports its missing initializer and the `::`", () => {
    const { syntaxDiagnostics } = checkLuau("const x :: number = 1\n");
    expect(syntaxDiagnostics.map((d) => [d.line, d.column, d.endLine, d.endColumn, d.message])).toEqual([
      [0, 0, 0, 7, "Missing initializer in const declaration"],
      [0, 8, 0, 10, "Expected identifier when parsing expression, got '::'"],
    ]);
  });

  // A narrative declaration ends at its line, even when it ends in a type
  // that a `|` line could go on with in Luau code (#1907).
  test.each(["local x :: number", "local x :: number = 1", "local a, b :: number"])(
    "%j in a narrative body stays one declaration, with no prose after it",
    (statement) => {
      const tree = parseSource(`${statement}\n`);
      const names: string[] = [];
      const cur = tree.cursor();
      do {
        if (cur.name === "LuauSparkdownVariableDefinition") names.push(`${cur.from}-${cur.to}`);
        if (/^(ImplicitAction|TextChunk)$/.test(cur.name)) names.push(cur.name);
      } while (cur.next());
      expect(names).toEqual([`0-${statement.length}`]);
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
        `LuauSparkdownVariableDefinition 0-${statement.length}`,
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
