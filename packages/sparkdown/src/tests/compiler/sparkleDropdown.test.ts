// A reactive control-flow region mounts its children inside a `display:contents`
// wrapper, but a <select> only enumerates <option>s that are its DIRECT DOM
// children — so options produced by if/for/match inside a dropdown are invisible.
// Until dynamic option lists are supported, the compiler warns rather than
// emitting a silently-broken dropdown.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function diagnosticsFor(source: string): { message: string; severity?: number }[] {
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
  const out: { message: string; severity?: number }[] = [];
  for (const docDiagnostics of Object.values(result.program.diagnostics ?? {})) {
    for (const d of docDiagnostics) {
      const raw = (d as any).message;
      out.push({
        message: typeof raw === "string" ? raw : raw?.value ?? JSON.stringify(d),
        severity: (d as any).severity,
      });
    }
  }
  return out;
}

const dynamicWarnings = (source: string) =>
  diagnosticsFor(source).filter((d) =>
    d.message.includes("Dynamic option lists"),
  );

describe("dropdown dynamic option lists", () => {
  test("`if` inside a dropdown warns", () => {
    const src = `store unlocked = true
screen form with
  dropdown:
    option "Easy" #value="easy"
    if unlocked then
      option "Hard" #value="hard"
    end
end
`;
    const warnings = dynamicWarnings(src);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.severity).toBe(2); // Warning
  });

  test("`for` inside a dropdown warns", () => {
    const src = `list opts = "a", "b"
screen form with
  dropdown:
    for o in opts do
      option "{o}"
    end
end
`;
    expect(dynamicWarnings(src)).toHaveLength(1);
  });

  test("a static option list does NOT warn", () => {
    const src = `screen form with
  dropdown:
    option "Easy" #value="easy"
    option "Hard" #value="hard"
end
`;
    expect(dynamicWarnings(src)).toHaveLength(0);
  });
});
