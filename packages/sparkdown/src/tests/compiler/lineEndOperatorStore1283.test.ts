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

const LINE_ENDS = ["= 1 +", "= 1 ..", "= 1 ==", "= 1 and", "= 1 or", "="];
const NEXT_LINES = ["local y = 2", "return 1", "do end", "for i = 1, 2 do end", "while true do end", "repeat until true", "break", ""];

describe("a line-end operator in a store before a statement keyword (I-1283)", () => {
  for (const lineEnd of LINE_ENDS) {
    for (const next of NEXT_LINES) {
      const body = `${next ? `  ${next}\n` : ""}end\n`;
      const source = `function f(t)\n  store x ${lineEnd}\n${body}`;
      test(JSON.stringify(source), () => {
        const official = officialErrorList(`function f(t)\n  local x ${lineEnd}\n${body}`).slice().sort();
        expect(official).toHaveLength(1);
        expect(sparkdownErrors(source)).toEqual(official);
      });
    }
  }
});
