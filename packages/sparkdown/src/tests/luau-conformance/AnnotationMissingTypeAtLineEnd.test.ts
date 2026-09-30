import { describe, expect, test } from "vitest";
import { diagnoseFilesDetailed } from "./diagnosticTestHarness";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";

// A type annotation `:` with nothing after it on its line takes its type from
// the next line, so a next line that starts a statement, closes a block or
// does not exist leaves the annotation empty. Luau reports that on the colon
// with the token it found instead of a type, for a variable's annotation and
// a function's return type alike (#1152).

describe("a type annotation left empty at the end of its line", () => {
  test.each([
    ["local w:\nlocal z = 1\n", "0:7-0:8 SyntaxError: Expected type, got 'local'"],
    ["function g()\n  local w:\nend\n", "1:9-1:10 SyntaxError: Expected type, got 'end'"],
    ["local w:\n", "0:7-0:8 SyntaxError: Expected type, got <eof>"],
    ["local w: -- a note\n", "0:7-0:9 SyntaxError: Expected type, got <eof>"],
    ["local w:\nreturn\n", "0:7-0:8 SyntaxError: Expected type, got 'return'"],
    ["local w:\nif true then end\n", "0:7-0:8 SyntaxError: Expected type, got 'if'"],
    ["function g():\n  return 1\nend\n", "0:12-0:13 SyntaxError: Expected type, got 'return'"],
    ["function g(a: number): end\n", "0:21-0:23 SyntaxError: Expected type, got 'end'"],
    ["function g(): = nil end\n", "0:12-0:14 SyntaxError: Expected type, got '='"],
    ["function g():\n  local x = 1\nend\n", "0:12-0:13 SyntaxError: Expected type, got 'local'"],
    ["local f = function():\n  return 1\nend\n", "0:20-0:21 SyntaxError: Expected type, got 'return'"],
  ])("%j reports the missing type on the colon", (source, message) => {
    expect(checkLuau(source).syntaxDiagnostics.map(describeDiagnostic)).toEqual([message]);
  });

  // A `.luau` file is also validated as it is, where its last line is the
  // end of the text rather than the `end` of the function `run` wraps it in.
  test.each([
    ["local w:", "0:7-0:8 Expected type, got <eof>"],
    ["local w:\n", "0:7-0:8 Expected type, got <eof>"],
    ["local w: -- a note\n", "0:7-0:9 Expected type, got <eof>"],
    ["function g():\n", "0:12-0:13 Expected type, got <eof>"],
    ["local w:\nlocal z = 1\n", "0:7-0:8 Expected type, got 'local'"],
  ])("%j in a .luau file reports the missing type on the colon", (source, message) => {
    const found = diagnoseFilesDetailed({ "snippet.luau": source })
      .filter((d) => d.file === "snippet.luau" && d.message.startsWith("Expected type"))
      .map(({ range, message }) => `${range!.start.line}:${range!.start.character}-${range!.end.line}:${range!.end.character} ${message}`);
    expect(found).toEqual([message]);
  });

  test.each([
    "local z:\nnumber = 1\n",
    "local z:\n  number = 1\n",
    "local z: -- a note\n  number = 1\n",
    "local x: number = 1\n",
    "local n: nil = nil\n",
    "local b: true = true\n",
    "local t:\n  { number } = {}\n",
    "local s:\n  typeof(1) = 1\n",
    "function g(): number\n  return 1\nend\n",
    "function g():\n  number\n  return 1\nend\n",
    "function g(): (number, string)\n  return 1, \"a\"\nend\n",
    "function g(): nil end\n",
    "function g(a: number) end\n",
  ])("%j is unaffected", (source) => {
    expect(checkLuau(source).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });
});
