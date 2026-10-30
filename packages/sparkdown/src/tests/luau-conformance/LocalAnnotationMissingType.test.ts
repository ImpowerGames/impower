import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";

describe("a type annotation with no type before `=` or `,`", () => {
  test.each([
    ["local x: = 1", "Expected type, got '='"],
    ["local x:= 1", "Expected type, got '='"],
    ["local a: , b = 1, 2", "Expected type, got ','"],
    ["local a:, b = 1, 2", "Expected type, got ','"],
    ["local x: --[[c]] = 1", "Expected type, got '='"],
    ["local x: --[=[ ]] ]=] , y = 1, 2", "Expected type, got ','"],
    ["function f(a: , b) end", "Expected type, got ','"],
  ])("%j reports the missing type", (statement, message) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([
      expect.stringContaining(message),
    ]);
  });

  test("a missing type before an `=` on the next line", () => {
    expect(checkLuau("local x: -- missing type\n= 1\n").syntaxDiagnostics.map(describeDiagnostic)[0]).toContain(
      "0:8-1:0 SyntaxError: Expected type, got '='",
    );
  });

  test.each([
    "local x: number = 1",
    "local x : number = 1",
    "local a: number, b = 1, 2",
    "local a, b: number = 1, 2",
    "local t = {m = function(self) return 1 end}\nlocal y = t:m()",
    "local t = {m = function(self) return 1 end}\nlocal y, z = t:m(), 2",
    "function f(a: number, b: string) end",
    "local x: number = 1 == 1 and 1 or 2",
    "local x: -- count, in points\n  number = 1",
    "local y: -- default = nil\n  number = 2",
    "local z:\n  -- a note, here\n  number = 3",
    "local w: -- ends; here\n  number = 4",
  ])("%j is unaffected", (statement) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});
