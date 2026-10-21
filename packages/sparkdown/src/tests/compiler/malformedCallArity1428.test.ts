// A call whose argument list has a syntax error reports Luau's error at
// Luau's range and no arity error, whether its callee is the enclosing
// function or any other name (I-1428). The arguments read before the error
// are not a call the arity check may judge.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

/** Sparkdown's errors, as `start-end message` in 0-based lines and characters, in position order. */
function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error)
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

/** Luau's errors for the function's lines alone (the story line after it is not Luau). */
function luauErrors(body: string): string[] {
  return officialErrorList(body).sort();
}

describe("a call with a syntax error in its arguments reports Luau's error (I-1428)", () => {
  for (const callee of ["f", "g"]) {
    for (const arg of ["'x'", "`x`"]) {
      test(`${callee}(1 ${arg}) inside function f`, () => {
        const body = `function f()\nlocal t = ${callee}(1 ${arg})\nend\n`;
        const official = luauErrors(body);
        expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(`${body}Go {f()}.\n`)).toEqual(official);
      });
    }
  }

  test("a well-formed self-call with the wrong arity still reports the arity error", () => {
    expect(sparkdownErrors("function f()\nlocal t = f(1)\nend\nGo {f()}.\n")).toEqual([
      "1:0-1:14 Function call to `f` requires 0 arguments, but got 1",
    ]);
  });

  test("a well-formed self-call with the right arity reports nothing", () => {
    expect(sparkdownErrors("function f(a)\nlocal _t = f(1)\nend\nGo {f(1)}.\n")).toEqual([]);
  });
});
