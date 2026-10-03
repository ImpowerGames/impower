import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { parseLuau } from "../../compiler/typecheck/DefinitionParser";
import { printAst } from "../../compiler/typecheck/printAst";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";

function expectLuauReading(body: string): void {
  const source = `function run()\n  ${body}\nend\n`;
  const expected = parseLuau(source);
  expect(expected.errors).toEqual([]);
  const units = readLuauUnits(parseSource(source), source);
  expect(units.prelude.errors).toEqual([]);
  expect(printAst(units.prelude.root)).toBe(printAst(expected.root));
  expect(stripAnsi(dumpTree(source)).split("\n").filter((line) => line.includes("ERROR_INCOMPLETE"))).toEqual([]);
}

describe("casts read their targets as types (#877)", () => {
  test.each([
    "number", "number?", "number? | string", "number & string",
    "(number) -> string", "{number}", "{value: number?}",
    "Array<number?>", "typeof(a)", '"literal"', "true",
  ])("reads %s and the following return", (target) => {
    expectLuauReading(`local a = nil :: ${target}\n  return a`);
  });

  test.each([
    "return (a :: number?) == nil",
    "return a :: number > 0",
    "return a :: number + 1",
    "return (a :: number) :: any",
    "return a :: number+1",
    "return a :: number and b",
    "return a :: number - 1",
    "return f(a :: number?, b)",
    "return {a :: number?, b}",
    "local a = nil :: number?; return a",
    "local a = nil :: number? --[[c]] return a",
    "local a = nil :: number --[[c]] ?; return a",
    "local a = nil :: number --[[c]] | string; return a",
    "local a = nil ::\n    number?\n  return a",
  ])("keeps the boundary in %s", expectLuauReading);

  test.each(["local a = nil ::", "local a = nil :: ;"])("reports a missing target in %s", (body) => {
    const source = `function run()\n  ${body}\nend\n`;
    expect(readLuauUnits(parseSource(source), source).prelude.errors.length).toBeGreaterThan(0);
  });
});
