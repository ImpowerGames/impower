import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

const HEADERS = ["f(a b)", "f(a, , b)", "f(a: number b)"];

const FUNCTION = "function ";

function withoutFunctionKeyword(errors: string[]): string[] {
  const shift = FUNCTION.length;
  return errors.map((e) =>
    e
      .replace(/^1:(\d+)-1:(\d+)/, (_, a, b) => `1:${Number(a) - shift}-1:${Number(b) - shift}`)
      .replace(/at column (\d+)/, (_, c) => `at column ${Number(c) - shift}`),
  );
}

describe("a define's method reports the errors Luau reports in its header (I-1401)", () => {
  for (const header of HEADERS) {
    const official = officialErrorList(`\n  ${FUNCTION}${header}\n    x = 1\n  end\n`).sort();
    const empty = officialErrorList(`\n  ${FUNCTION}${header}\n  end\n`).sort();
    test(`${JSON.stringify(header)} in a method`, () => {
      expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`define X with\n  ${header}\n    x = 1\n  end\nend\n`)).toEqual(withoutFunctionKeyword(official));
    });
    test(`${JSON.stringify(header)} in a method spelled as a function`, () => {
      expect(sparkdownErrors(`define X with\n  ${FUNCTION}${header}\n    x = 1\n  end\nend\n`)).toEqual(official);
    });
    test(`${JSON.stringify(header)} in a method with no body`, () => {
      expect(sparkdownErrors(`define X with\n  ${header}\n  end\nend\n`)).toEqual(withoutFunctionKeyword(empty));
    });
    test(`${JSON.stringify(header)} in a method spelled as a function with no body`, () => {
      expect(sparkdownErrors(`define X with\n  ${FUNCTION}${header}\n  end\nend\n`)).toEqual(empty);
    });
  }

  for (const call of ['print("x")', "print(1)"]) {
    test(`${JSON.stringify(call)} as a line of the body reports nothing`, () => {
      expect(sparkdownErrors(`define X with\n  x = 1\n  ${call}\nend\n`)).toEqual([]);
    });
  }
  test("a method before a call line still reports its header", () => {
    expect(sparkdownErrors("define X with\n  f(a b)\n    x = 1\n  end\n  print(1)\nend\n")).toContain(
      "1:6-1:7 Expected ')' (to close '(' at column 4), got 'b'",
    );
  });

  test("the ticket's top-level function reports the same error", () => {
    expect(sparkdownErrors("function f(a b)\n  x = 1\nend\n")).toEqual(officialErrorList("function f(a b)\n  x = 1\nend\n").sort());
  });
});
