// A define's method and a Sparkle handler's closure, which the type checker
// does not read, report every syntax error Luau reports for the body read
// alone, once each, in Luau's words at Luau's range, as a function's body
// does (I-1368, after I-1322). The validator leaves them all to the
// lowerer's reading there.
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

// Lines of a body with syntax errors, each in a statement the grammar reads
// to its end (no unread token).
const FORMS = [
  "local t = {1 2}",
  "x = {1, 2 3 4}",
  "x = foo(",
  "local a = (1 + ",
  "x = (if c)then",
  "local x: = 1",
  "local t = { a = 1 b = 2 }",
  "local function g(a: number b) end",
  "while nil:do end",
];

describe("a define's method reports every error Luau reports for its body (I-1368)", () => {
  for (const line of FORMS) {
    // The method stands for the function `function f() … end` on its lines.
    const official = officialErrorList(`\n  function f()\n    ${line}\n  end\n`).sort();
    test(`${JSON.stringify(line)} in a method`, () => {
      expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`define X with\n  f()\n    ${line}\n  end\nend\n`)).toEqual(official);
    });
    test(`${JSON.stringify(line)} in a method spelled as a function`, () => {
      expect(sparkdownErrors(`define X with\n  function f()\n    ${line}\n  end\nend\n`)).toEqual(official);
    });
  }
});

describe("a Sparkle handler's closure reports every error Luau reports for its body (I-1368)", () => {
  // The forms whose errors all stand in the body's line: the closure runs
  // as a function value, `function() … end` on its lines.
  for (const line of ["local t = {1 2}", "x = {1, 2 3 4}", "local x: = 1", "local t = { a = 1 b = 2 }", "print(1 2)", "while nil:do end"]) {
    test(JSON.stringify(line), () => {
      const official = officialErrorList(`local _ = function()\n    ${line}\nend\n`)
        .map((e) => e.replace(/^1:(\d+)-1:(\d+)/, "2:$1-2:$2"))
        .sort();
      expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`layout main with\n  button @click={\n    ${line}\n  }\nend\n`)).toEqual(official);
    });
  }

  // Luau's reading of the closure meets its end at the `}`, where the value
  // it is missing is reported, once.
  for (const line of ["x = foo(", "local a = (1 + "]) {
    test(`${JSON.stringify(line)} reports its missing value once`, () => {
      expect(sparkdownErrors(`layout main with\n  button @click={\n    ${line}\n  }\nend\n`)).toEqual([
        "3:2-3:2 Expected identifier when parsing expression, got 'end'",
      ]);
    });
  }
});
