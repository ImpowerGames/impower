// Inline event-handler closures (`@input={ name = event.value }`) may span
// lines (#1225): a closure its line leaves open goes on to its `}`. One left
// without its `}` ends where a line starts with `end`, `else`, `elseif` or
// `case`, and the lowerer reports the missing `}` instead of silently
// dropping the statements.

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
    const src = `layout form with
  field @input={ name = event.value }
end
`;
    expect(unterminated(src)).toHaveLength(0);
  });

  test("a closure whose `}` is on a later line compiles cleanly", () => {
    const src = `layout form with
  button "x" @click={ score = 0
    combo = 0 }
end
`;
    expect(unterminated(src)).toHaveLength(0);
  });

  test("a closure with no `}` is flagged", () => {
    const src = `layout form with
  button "x" @click={ score = 0
    combo = 0
end
`;
    expect(unterminated(src)).toHaveLength(1);
  });
});
