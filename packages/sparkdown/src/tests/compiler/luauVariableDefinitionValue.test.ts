// `LuauVariableDefinitionValue` is `LuauExpression` without the statements
// it reaches through `LuauDeclarations` and without bare keywords, so a Luau
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
  test("is LuauExpression with a function in place of statements and `...` in place of keywords", () => {
    const expected = repository["LuauExpression"]!.patterns!.map((p) =>
      p.include === "#LuauDeclarations"
        ? { include: "#LuauFunctionDefinition" }
        : p.include === "#LuauKeyword"
          ? { include: "#LuauUnitKeywords" }
          : p,
    );
    expect(repository["LuauVariableDefinitionValue"]!.patterns).toEqual(expected);
  });
});

// The Luau and narrative declaration rules differ only in their content.
describe("the two declaration rules", () => {
  test("share their begin, captures and end", () => {
    const luau = repository["LuauVariableDefinition"]!;
    const narrative = repository["LuauSparkdownVariableDefinition"]!;
    expect(narrative.begin).toBe(luau.begin);
    expect(narrative.beginCaptures).toEqual(luau.beginCaptures);
    expect(narrative.end).toBe(luau.end);
  });
});
