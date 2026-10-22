// A define's method reports the syntax errors Luau reports in its header
// (its parameter list), as it reports those of its body, once each, in
// Luau's words at Luau's range, as the function it stands for read whole
// reports them (I-1401, after I-1368).
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

/** Sparkdown's syntax errors, as `start-end message` in 0-based lines and characters, in position order. */
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

// Headers with a syntax error in their parameter list.
const HEADERS = ["f(a b)", "f(a, , b)", "f(a: number b)"];

const FUNCTION = "function ";

/**
 * The official errors of `function <header>` on line 1, placed where the
 * author wrote the header without `function ` (the `name(args)` form): each
 * character and the column a message names move back by its length.
 */
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
    // The method stands for the function `function f(…) … end` on its lines.
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

  // A call written as a line of the body is no method: it leaves the define
  // its `end`, and its arguments are no parameter list to report (I-1411).
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
