import { expect, it } from "vitest";
import { lexLuauDocumentForTesting } from "../../compiler/typecheck/readLuauAst";

const lex = (text: string) => lexLuauDocumentForTesting(text).map(({ kind, text }) => [kind, text]);

it("reads @name, @[ and a bare @ as one token each", () => {
  expect(lex("@native function f() end")).toEqual([
    ["attribute", "@native"],
    ["keyword", "function"],
    ["name", "f"],
    ["symbol", "("],
    ["symbol", ")"],
    ["keyword", "end"],
  ]);
  expect(lex("@[deprecated] function f() end").slice(0, 3)).toEqual([
    ["attributeOpen", "@["],
    ["name", "deprecated"],
    ["symbol", "]"],
  ]);
  expect(lex("@ function f() end").slice(0, 2)).toEqual([
    ["attribute", "@"],
    ["keyword", "function"],
  ]);
  expect(lex("@ [x]").slice(0, 2)).toEqual([
    ["attribute", "@"],
    ["symbol", "["],
  ]);
  expect(lex("@function").slice(0, 1)).toEqual([["attribute", "@function"]]);
});
