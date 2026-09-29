// `LuauVariableDefinitionValue` is `LuauExpression` without the statements
// it reaches through `LuauDeclarations` and without bare keywords, so a Luau
// declaration whose comma ends its line cannot take the next line's `end`,
// `until` or `return` as a value. An expression form added to
// `LuauExpression` must be added there too, or it stops working as a later
// value in a declaration list.

import { describe, expect, test } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";

type Patterns = { include: string }[];
const repository = GRAMMAR_DEFINITION.repository as unknown as Record<
  string,
  { patterns?: Patterns }
>;

describe("LuauVariableDefinitionValue", () => {
  test("is LuauExpression without statements and bare keywords", () => {
    const expected = repository["LuauExpression"]!.patterns!.flatMap((p) =>
      p.include === "#LuauDeclarations"
        ? [{ include: "#LuauFunctionDefinition" }]
        : p.include === "#LuauKeyword"
          ? []
          : [p],
    );
    expect(repository["LuauVariableDefinitionValue"]!.patterns).toEqual(expected);
  });
});
