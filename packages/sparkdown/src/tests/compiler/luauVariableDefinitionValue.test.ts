// `LuauVariableDefinitionValue` is `LuauExpression` without the statements
// it reaches through `LuauExpressionDeclarations`, without the direct return statement
// and without bare keywords, so a Luau
// declaration whose comma ends its line cannot take the next line's `end`,
// `until` or `return` as a value. An expression form added to
// `LuauExpression` must be added there too, or it stops working as a later
// value in a declaration list. The runtime cases in
// `TrailingCommaValueList.test.ts` check the values themselves.

import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";

type Patterns = { include: string }[];
const repository = GRAMMAR_DEFINITION.repository as unknown as Record<
  string,
  { patterns?: Patterns; begin?: string; beginCaptures?: unknown; end?: string }
>;

describe("LuauVariableDefinitionValue", () => {
  test("excludes return statements, substitutes functions for declarations and `...` for keywords", () => {
    const expressions = repository["LuauExpression"]!.patterns!;
    expect(expressions).toContainEqual({ include: "#LuauReturnStatement" });
    const expected = expressions.filter((p) => p.include !== "#LuauReturnStatement").map((p) =>
      p.include === "#LuauExpressionDeclarations"
        ? { include: "#LuauFunctionDefinition" }
        : p.include === "#LuauKeyword"
          ? { include: "#LuauUnitKeywords" }
          : p,
    );
    expect(repository["LuauVariableDefinitionValue"]!.patterns).toEqual(expected);
    expect(repository["LuauVariableDefinitionValue"]!.patterns).not.toContainEqual({ include: "#LuauReturnStatement" });
  });
});

// The Luau and narrative declaration rules differ only in their content
// and in where they end at a line end: the Luau declaration reads its value
// from the next line after an `=` that ends its line (#1247), and the
// narrative one ends at its line.
describe("the two declaration rules", () => {
  test("share their begin, captures and end but for the line end after an `=`", () => {
    const luau = repository["LuauVariableDefinition"]!;
    const narrative = repository["LuauSparkdownVariableDefinition"]!;
    expect(narrative.begin).toBe(luau.begin);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
    const lineEndAfterValue = String.raw`|(?:(?<![^=~<>]=(?:[^\S\n\r])*)|(?<=(?:[-][-])[^\n]*))(?=$)`;
    expect(luau.end).toContain(lineEndAfterValue);
    expect(luau.end!.replace(lineEndAfterValue, "").replace("(?=^|[;)\\]}])", "(?=^|$|[;)\\]}])")).toBe(narrative.end);
  });
});
