// Dynamic option lists (if/for/match inside a dropdown) are supported: the
// reactive runtime is wrapperless, so for/if-generated <option>s become DIRECT
// children of the <select> (verified end-to-end in spark-web-player's
// domControlFlow DOM test). The compiler must NOT warn about them.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function diagnosticMessages(source: string): string[] {
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

describe("dropdown dynamic option lists", () => {
  test("`for` inside a dropdown compiles without a dynamic-options warning", () => {
    const src = `list opts = "a", "b"
screen form with
  dropdown:
    for o in opts do
      option "{o}"
    end
end
`;
    expect(
      diagnosticMessages(src).filter((m) => m.includes("Dynamic option lists")),
    ).toHaveLength(0);
  });

  test("`if` inside a dropdown compiles without a dynamic-options warning", () => {
    const src = `store unlocked = true
screen form with
  dropdown:
    option "Easy" #value="easy"
    if unlocked then
      option "Hard" #value="hard"
    end
end
`;
    expect(
      diagnosticMessages(src).filter((m) => m.includes("Dynamic option lists")),
    ).toHaveLength(0);
  });
});
