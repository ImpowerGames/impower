import { describe, expect, test } from "vitest";
import { diagnoseFilesDetailed } from "./diagnosticTestHarness";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";

// A type annotation `:` with nothing after it on its line takes its type from
// the next line, so a next line that starts a statement, closes a block or
// does not exist leaves the annotation empty. Luau reports that with the
// token it found instead of a type, for a variable's annotation and a
// function's return type alike (#1152), from the end of the colon (#1174)
// to the end of the colon's line, where the type should stand, rather than
// to the token on a later line that Luau's parser recovers with (#1286).

describe("a type annotation left empty at the end of its line", () => {
  test.each([
    ["local w:\nlocal z = 1\n", "0:8-1:0 SyntaxError: Expected type, got 'local'"],
    ["function g()\n  local w:\nend\n", "1:10-2:0 SyntaxError: Expected type, got 'end'"],
    ["local w:\n", "0:8-1:0 SyntaxError: Expected type, got <eof>"],
    ["local w: -- a note\n", "0:8-1:0 SyntaxError: Expected type, got <eof>"],
    ["local w:\nreturn\n", "0:8-1:0 SyntaxError: Expected type, got 'return'"],
    ["local w:\nif true then end\n", "0:8-1:0 SyntaxError: Expected type, got 'if'"],
    ["function g():\n  return 1\nend\n", "0:13-1:0 SyntaxError: Expected type, got 'return'"],
    ["function g(a: number): end\n", "0:22-0:26 SyntaxError: Expected type, got 'end'"],
    ["function g(): = nil end\n", "0:13-0:15 SyntaxError: Expected type, got '='"],
    ["function g():\n  local x = 1\nend\n", "0:13-1:0 SyntaxError: Expected type, got 'local'"],
    ["local f = function():\n  return 1\nend\n", "0:21-1:0 SyntaxError: Expected type, got 'return'"],
    ["type function F(t):\n  return t\nend\n", "0:19-1:0 SyntaxError: Expected type, got 'return'"],
    ["type function F(t): = nil end\n", "0:19-0:21 SyntaxError: Expected type, got '='"],
  ])("%j reports the missing type", (source, message) => {
    expect(checkLuau(source).syntaxDiagnostics.map(describeDiagnostic)).toEqual([message]);
  });

  // Every error a script's compile reports, with its range.
  const errorsIn = (file: string, sources: Record<string, string>) =>
    diagnoseFilesDetailed(sources)
      .filter((d) => d.file === file && d.severity === 1)
      .map(({ range, message }) => `${range!.start.line}:${range!.start.character}-${range!.end.line}:${range!.end.character} ${message}`);

  // A `.luau` file is also validated as it is, where its last line is the
  // end of the text rather than the `end` of the function `run` wraps it in.
  test.each([
    ["local w:", "0:8-0:8 Expected type, got <eof>"],
    ["local w:\n", "0:8-1:0 Expected type, got <eof>"],
    ["local w: -- a note\n", "0:8-1:0 Expected type, got <eof>"],
    ["local w:\nlocal z = 1\n", "0:8-1:0 Expected type, got 'local'"],
  ])("%j in a .luau file reports the missing type", (source, message) => {
    expect(errorsIn("snippet.luau", { "snippet.luau": source })).toEqual([message]);
  });

  // A function whose header ends the file is unclosed too, as Luau also says.
  test("a return type that ends a .luau file", () => {
    expect(errorsIn("snippet.luau", { "snippet.luau": "function g():\n" })).toEqual([
      "0:0-0:13 This function is missing its closing `end` keyword. Without it, the lines below it are read as part of this function, up to the next `scene`, `branch` or the end of the file.",
      "0:13-1:0 Expected type, got <eof>",
    ]);
  });

  // The language server hands the parser about 16 KB at a time, ending each
  // piece at a line end, so the parser cannot look past `local w:` when it
  // ends the first piece.
  test("an annotation whose next line starts the next piece of the text", () => {
    const filler = "-- filler\n".repeat(1638);
    expect(filler.length).toBe(16380);
    const source = `${filler}local w:\nlocal z = 1\n`;
    expect(errorsIn("snippet.luau", { "snippet.luau": source })).toEqual([
      "1638:8-1639:0 Expected type, got 'local'",
    ]);
  });

  // The implicit `function` of a method in a `define` block.
  test.each([
    ["  greet():\n    return 1\n  end\n", "1:10-2:0 Expected type, got 'return'"],
    ["  greet(): = nil end\n", "1:10-1:12 Expected type, got '='"],
  ])("a method's return type in %j", (method, message) => {
    const source = `define hero as character with\n${method}end\nHi.\n`;
    expect(errorsIn("main.sd", { "main.sd": source })).toEqual([message]);
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

  // Only a missing type's range ends with its line; another error that runs
  // over several lines keeps the range Luau gives it.
  test("an error other than a missing type keeps its range across lines", () => {
    expect(errorsIn("main.sd", { "main.sd": "function f()\n  (1 +\n    2)\nend\n" })).toEqual([
      "1:2-2:6 Incomplete statement: expected assignment or a function call",
    ]);
  });
});
