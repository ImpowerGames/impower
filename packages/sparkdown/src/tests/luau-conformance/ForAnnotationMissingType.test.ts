import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic, expectLuauSyntax } from "./typecheckTestHarness";

describe("a for loop variable's annotation with no type", () => {
  test.each([
    ["for i: = 1, 3 do end", "0:6-0:8 SyntaxError: Expected type, got '='"],
    ["for i:= 1, 3 do end", "0:6-0:7 SyntaxError: Expected type, got '='"],
    ["for i : = 1, 3 do end", "0:7-0:9 SyntaxError: Expected type, got '='"],
    ["for i: --[[c]] = 1, 3 do end", "0:6-0:16 SyntaxError: Expected type, got '='"],
    ["for k: , v in pairs({}) do end", "0:6-0:8 SyntaxError: Expected type, got ','"],
    ["for k, v: , w in pairs({}) do end", "0:9-0:11 SyntaxError: Expected type, got ','"],
  ])("%j reports the missing type", (statement, message) => {
    expectLuauSyntax(`${statement}\n`, [message]);
  });

  test.each([
    "for i: number = 1, 3 do end",
    "for i : number = 1, 3 do end",
    "for k: string, v in pairs({a = 1}) do end",
    "for k, v: number in pairs({a = 1}) do end",
    "for i = 1, 3 do end",
    "for k, v in pairs({a = 1}) do end",
  ])("%j is unaffected", (statement) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});

describe("a `:` after a name in a value with no method name", () => {
  test.each([
    ["local t = {}\nt.a: = 2", "1:5-1:6 SyntaxError: Expected identifier when parsing method name, got '='"],
    ["local t = {}\nt: = 2", "1:3-1:4 SyntaxError: Expected identifier when parsing method name, got '='"],
    ["local t = {a = {}}\nt.a.b: = 3", "1:7-1:8 SyntaxError: Expected identifier when parsing method name, got '='"],
    ["local t = {}\nt.a:, t.b = 1, 2","1:4-1:5 SyntaxError: Expected identifier when parsing method name, got ','"],
    [
      "local t = {}\nfor i = 1, 3 do t.a: = i end",
      "1:21-1:22 SyntaxError: Expected identifier when parsing method name, got '='",
    ],
  ])("%j reports the missing method name", (source, message) => {
    expectLuauSyntax(`${source}\n`, [message]);
  });

  test.each([
    "local t = {m = function(self) end}\nt:m()",
    "local obj = {a = {m = function(self) end}}\nobj.a:m()",
    "local obj = {a = {m = function(self) return 1 end}}\nlocal x = obj.a:m()",
    "local obj = {a = {m = function(self) return 1 end}}\nfor i = obj.a:m(), 3 do end",
  ])("%j is unaffected", (source) => {
    expect(checkLuau(`${source}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});
