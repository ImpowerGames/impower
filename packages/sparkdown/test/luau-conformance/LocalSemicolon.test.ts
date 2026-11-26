import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";

function nodeNames(source: string): string[] {
  const tree = parseSource(source);
  const names: string[] = [];
  const cur = tree.cursor();
  do {
    names.push(cur.name.replace(/_c\d+$/, ""));
  } while (cur.next());
  return names;
}

function nodeNamesAt(source: string, from: number, length: number): string[] {
  const tree = parseSource(source);
  const names: string[] = [];
  const cur = tree.cursor();
  do {
    if (cur.from === from && cur.to === from + length) names.push(cur.name.replace(/_c\d+$/, ""));
  } while (cur.next());
  return names;
}

const STATEMENTS = [
  "local x = 1;",
  "local x = t.y;",
  "local x = (1);",
  "local x = f();",
  "local x: number = f();",
  "local a, b = 1, f();",
  "local x: number;",
  "local x = if t then 1 else 2;",
  "local x = iffy;",
  "local x = 1 +\n  2;",
  "local x = not --[[c]] t;",
  "local x: --[[c]] number;",
  "local x = not --[=[ ]] ]=] t;",
] as const;

describe("a local statement ends at a `;` directly after its value", () => {
  test.each(STATEMENTS)("%s", (statement) => {
    const source = `function g()\n  ${statement}\n  return x\nend\n`;
    const semicolon = source.indexOf(";");
    expect(nodeNames(source)).not.toContain("ERROR_INCOMPLETE");
    expect(nodeNamesAt(source, semicolon, 1)).toContain("LuauSemicolonSeparator");
    expect(checkLuau(`local t, f = {y = 1}, function() return 1 end\n${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  test.each(["local foo = -;", "local foo = - ;", "local foo = 1 +;", "local foo = 1 ==;", "local foo = a ..;", "foo = -;", "local foo = ;", "local foo =;", "local foo: number = ;", "foo = ;", "foo += ;", "local foo = a and;", "local foo = 1 or;", "local foo = not;", "local foo = #;", "local foo = a - -;"])(
    "%s still reports the operator with no operand",
    (statement) => {
      expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([
        expect.stringContaining("Expected identifier when parsing expression, got ';'"),
      ]);
    },
  );

  test("local foo = a::; reports the missing type", () => {
    expect(checkLuau("local foo = a::;\n").syntaxDiagnostics.map(describeDiagnostic)).toEqual([
      "0:15-0:16 SyntaxError: Expected type, got ';'",
    ]);
  });

  test.each([
    ["local x: ;", "Expected type, got ';'"],
    ["local x = if;", "Expected identifier when parsing expression, got ';'"],
    ["local foo = -\n;", "Expected identifier when parsing expression, got ';'"],
    ["local foo = -\n\n  ;", "Expected identifier when parsing expression, got ';'"],
    ["local x = 1 + if;", "Expected identifier when parsing expression, got ';'"],
    ["local x =\n;", "Expected identifier when parsing expression, got ';'"],
    ["local x: --[[c]] ;", "Expected type, got ';'"],
    ["local x = if --[[c]] ;", "Expected identifier when parsing expression, got ';'"],
    ["local foo = - --[[c]] ;", "Expected identifier when parsing expression, got ';'"],
    ["local foo = - --[=[c]=] ;", "Expected identifier when parsing expression, got ';'"],
    ["local x: --[=[ ]] ]=] ;", "Expected type, got ';'"],
    ["local x = if --[=[ ]] ]=] ;", "Expected identifier when parsing expression, got ';'"],
    ["local x: -- missing type\n;", "Expected type, got ';'"],
    ["local x = if -- missing value\n;", "Expected identifier when parsing expression, got ';'"],
    ["local foo = - -- missing operand\n;", "Expected identifier when parsing expression, got ';'"],
  ])("%j reports the value left empty before its `;`", (statement, message) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([
      expect.stringContaining(message),
    ]);
  });

  test("an operator followed by a comment holding `;` keeps its operand", () => {
    expect(checkLuau("local a = 1 + -- note; more\n  2\n").syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  test("a multi-name local still reads both names", () => {
    const source = `function g()\n  local a, b = 1, 2;\nend\n`;
    expect(nodeNames(source)).not.toContain("ERROR_INCOMPLETE");
    expect(nodeNamesAt(source, source.indexOf("a,"), 1)).toContain("LuauVariableName");
    expect(nodeNamesAt(source, source.indexOf("b ="), 1)).toContain("LuauVariableName");
  });
});
