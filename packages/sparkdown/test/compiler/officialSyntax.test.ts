import { expect, test } from "vitest";
import { officialSyntaxErrors, parseOfficialSyntax } from "./officialSyntax";

test("the official parser exports its first syntax error's message and full range", () => {
  expect(officialSyntaxErrors("function f()\n  Hi, Bob\nend\n")).toBeDefined();
  expect(officialSyntaxErrors("function f()\n  Hi, Bob\nend\n")[0]).toEqual({
    message: "Expected '=' when parsing assignment, got 'end'",
    location: { begin: { line: 2, column: 0 }, end: { line: 2, column: 3 } },
  });
});

test("official diagnostic columns retain upstream UTF-8 byte offsets", () => {
  expect(officialSyntaxErrors('local x = "😀"; t. + 1')).toBeDefined();
  expect(officialSyntaxErrors('local x = "😀"; t. + 1')[0]).toEqual({
    message: "Expected identifier, got '+'",
    location: { begin: { line: 0, column: 21 }, end: { line: 0, column: 22 } },
  });
});

test("the oracle resets diagnostics for each parse and still returns valid ASTs", () => {
  expect(parseOfficialSyntax("local x =").errors).toBeGreaterThan(0);
  const valid = parseOfficialSyntax("local x = 1");
  expect(valid.errors).toBe(0);
  expect(valid.diagnostics).toEqual([]);
  expect(valid.root).not.toBeNull();
});
