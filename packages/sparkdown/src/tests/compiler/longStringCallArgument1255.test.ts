import { describe, expect, test } from "vitest";
import { parseOfficialTree, withoutLocations } from "./officialAstTestUtils";
import { printOfficialAst } from "./printOfficialAst";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";

function expectLuauReading(source: string): void {
  const expected = parseOfficialTree(source);
  expect(expected.errors).toEqual([]);
  const units = readLuauUnits(parseSource(source), source);
  expect(units.prelude.errors).toEqual([]);
  expect(units.flows).toHaveLength(0);
  expect(withoutLocations(printOfficialAst(units.prelude.root))).toEqual(withoutLocations(expected.root));
  expect(stripAnsi(dumpTree(source))).not.toContain("ERROR_INCOMPLETE");
}

describe("long strings are a call's single argument (#1255)", () => {
  for (const level of [0, 1, 3, 8]) {
    for (const whitespace of ["", " ", "\t"]) {
      test(`a level-${level} string after ${JSON.stringify(whitespace)}`, () => {
        const equals = "=".repeat(level);
        expectLuauReading(`function run()\n  f${whitespace}[${equals}[x]${equals}]\nend\n`);
      });
    }
  }

  for (const callee of ["f", "a.b", "a:m", "f()", "a[1]", "(f)"]) {
    test(`${callee} takes a long string holding a block terminator`, () => {
      expectLuauReading(`function run()\n  ${callee} [===[\nend\n]=]\n]===]\n  g()\nend\n`);
    });
  }

  test("an index whose key is a long string stays an index", () => {
    expectLuauReading("function run()\n  local value = a[ [=[key]=] ]\n  return value\nend\n");
  });
});
