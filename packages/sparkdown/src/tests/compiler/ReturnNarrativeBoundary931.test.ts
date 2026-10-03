import { describe, expect, test } from "vitest";
import { AstStatReturn, AstStatSparkdownExplicit } from "../../compiler/typecheck/Ast";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { parseSource } from "./grammarSnapshot";

const read = (text: string) => readLuauUnits(parseSource(text), text);
describe("narrative return boundaries", () => {
  for (const ret of ["return", "& return", "return 5", "& return 5", "return 1, 2", "& return 1, 2"]) {
    test.each([
      ["prelude", `${ret}\nProse.\n& f()\n`, 0],
      ["flow", `scene a\n  ${ret}\n  Prose.\n  & f()\nend\n`, 1],
    ] as const)(`${ret} in the %s ends before prose`, (kind, text, line) => {
      const units = read(text);
      const unit = kind === "prelude" ? units.prelude : units.flows[0]!;
      expect(unit.errors.map((e) => e.message)).toEqual([]);
      const statement = unit.statements[0]!.statement;
      const returned = statement instanceof AstStatSparkdownExplicit ? statement.statement : statement;
      if (!ret.startsWith("& ")) {
        expect(unit.statements).toHaveLength(1);
        expect(returned instanceof AstStatReturn).toBe(false);
        return;
      }
      expect(returned instanceof AstStatReturn).toBe(true);
      if (!(returned instanceof AstStatReturn)) return;
      expect(returned.list).toHaveLength(ret.includes(",") ? 2 : ret.endsWith("5") ? 1 : 0);
      expect(returned.location.begin.line).toBe(line);
      expect(returned.location.end.line).toBe(line);
      expect(unit.statements).toHaveLength(2);
    });
  }
  test("a missing value after a comma is still a syntax error", () => {
    expect(read("& return 1,\nProse.\n").prelude.errors.length).toBeGreaterThan(0);
  });
  test("a written function still reads a return value from the next line", () => {
    expect(read("function f()\n  return\n    5\nend\n").prelude.errors.map((e) => e.message)).toEqual([]);
  });
  test("a written function still requires return to be its block's final statement", () => {
    expect(read("function f()\n  return 5\n  local x = 6\nend\n").prelude.errors.map((e) => e.message).join("\n")).toContain("Expected 'end'");
  });
});
