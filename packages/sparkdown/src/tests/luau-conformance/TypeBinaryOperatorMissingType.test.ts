import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";

// A type's `|`, `&` or `->` with no type before the `=`, `,` or `;` that
// follows it (`local m: number | = 1`) is a syntax error in Luau, worded with
// the token it found instead of a type (#1153).

describe("a type binary operator with no type after it", () => {
  test.each([
    ["local m: number | = 1", "Expected type, got '='"],
    ["local m: number & = 1", "Expected type, got '='"],
    ["local f: (number) -> = nil", "Expected type, got '='"],
    ["local m: number |= 1", "Expected type, got '='"],
    ["local a: number | , b = 1, 2", "Expected type, got ','"],
    ["local m: number | --[[c]] = 1", "Expected type, got '='"],
    ["function f(a: number & , b) end", "Expected type, got ','"],
  ])("%j reports the missing type", (statement, message) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([
      expect.stringContaining(message),
    ]);
  });

  test.each([
    "local m: number | string = 1",
    "local m: number & string = 1",
    "local f: (number) -> string = nil",
    "local m: number|string = 1",
    // A union continued onto the next line (#1053).
    "local m: number |\n  string = 1",
    // A bare `->` is sparkdown's divert-target type, not a dangling operator.
    "function cut_to(escape: ->, b) end",
    "function cut_to(escape: ->) end",
  ])("%j is unaffected", (statement) => {
    expect(checkLuau(`${statement}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});
