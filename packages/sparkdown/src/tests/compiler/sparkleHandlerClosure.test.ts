// Inline event-handler closures (`@input={ name = event.value }`) are
// single-line: the event attribute is line-oriented, so the closing `}` must be
// on the `=` line. A body split across lines is force-closed at the newline;
// the lowerer detects the missing `}` and raises a diagnostic instead of
// silently dropping the statements past line 1.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function diagnosticsFor(source: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({
    textDocument: { uri: "inmemory:///main.sd" },
  });
  const out: string[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      out.push(typeof raw === "string" ? raw : raw?.value ?? JSON.stringify(d));
    }
  }
  return out;
}

const unterminated = (source: string): string[] =>
  diagnosticsFor(source).filter((m) => m.includes("missing its closing `}`"));

describe("inline handler closure termination", () => {
  test("a single-line closure compiles cleanly (no diagnostic)", () => {
    const src = `screen form with
  field @input={ name = event.value }
end
`;
    expect(unterminated(src)).toHaveLength(0);
  });

  test("a closure whose `}` is missing on the line is flagged", () => {
    // The `}` is on the next line, so the line-oriented attribute force-closes
    // the closure at the newline — `combo = 0` and the `}` are dropped.
    const src = `screen form with
  button "x" @click={ score = 0
    combo = 0 }
end
`;
    expect(unterminated(src)).toHaveLength(1);
  });
});
