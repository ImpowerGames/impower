import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

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

function luauErrors(body: string): string[] {
  return officialErrorList(body).sort();
}

describe("a call with a syntax error in its arguments reports Luau's error (I-1428)", () => {
  for (const callee of ["f", "g"]) {
    for (const args of ["1 'x'", "1 `x`", "1,", "1 + "]) {
      test(`${callee}(${args}) inside function f`, () => {
        const body = `function g()\nend\nfunction f()\nlocal t = ${callee}(${args})\nend\n`;
        const official = luauErrors(body);
        expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(`${body}scene start\n  Go {f()}.\nend\n`)).toEqual(official);
      });
    }
  }

  test("a well-formed self-call with the wrong arity still reports the arity error", () => {
    expect(sparkdownErrors("function f()\nlocal t = f(1)\nend\nscene start\n  Go {f()}.\nend\n")).toEqual([
      "1:0-1:14 Function call to `f` requires 0 arguments, but got 1",
    ]);
  });

  test("a well-formed self-call with the right arity reports nothing", () => {
    expect(sparkdownErrors("function f(a)\nlocal _t = f(1)\nend\nscene start\n  Go {f(1)}.\nend\n")).toEqual([]);
  });
});
