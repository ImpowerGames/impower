import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";

// A type annotation `:` with no type before the `=` or `,` that follows it
// (`local x: = 1`) is a syntax error in Luau, worded with the token it found
// instead of a type (#1143).

describe("a type annotation with no type before `=` or `,`", () => {
  test.each([
    ["local x: = 1", "Expected type, got '='"],
    ["local x:= 1", "Expected type, got '='"],
    ["local a: , b = 1, 2", "Expected type, got ','"],
    ["local a:, b = 1, 2", "Expected type, got ','"],
    // Comments and line breaks are trivia to Luau.
    ["local x: --[[c]] = 1", "Expected type, got '='"],
    ["local x: --[=[ ]] ]=] , y = 1, 2", "Expected type, got ','"],
    ["function f(a: , b) end", "Expected type, got ','"],
  ])("%j reports the missing type", (statement, message) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([
      expect.stringContaining(message),
    ]);
  });

  // Sparkdown does not continue a statement onto a line that starts with `=`,
  // and reports that separately; the annotation is still reported first.
  test("a missing type before an `=` on the next line", () => {
    expect(checkLuau("local x: -- missing type\n= 1\n").syntaxDiagnostics.map(describeDiagnostic)[0]).toContain(
      "0:7-0:9 SyntaxError: Expected type, got '='",
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
  ])("%j is unaffected", (statement) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});
