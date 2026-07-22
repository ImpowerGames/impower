// Classes on a Sparkle element line are SPACE-separated bare words after the tag
// (`row hud`), not dot-prefixed. A dotted class (`row.hud`) breaks the header
// parse into `<tag>` + an ERROR_UNRECOGNIZED remainder; the ValidationAnnotator
// turns that into a friendly "use spaces" warning instead of silently dropping
// the class. See project_reactive_sparkle_ui.

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

const warnsDotted = (diags: string[]) =>
  diags.some((m) => m.includes("space-separated"));

describe("dotted-class warning", () => {
  test("a dotted class on a container element warns to use spaces", () => {
    const diags = diagnosticsFor(
      `layout main with\n  row.hud #gap=12:\n    text "x"\nend\n`,
    );
    expect(warnsDotted(diags)).toBe(true);
  });

  test("a dotted class on a content element warns", () => {
    const diags = diagnosticsFor(`layout main with\n  text.title "Hi"\nend\n`);
    expect(warnsDotted(diags)).toBe(true);
  });

  test("space-separated classes produce no dotted-class warning", () => {
    const diags = diagnosticsFor(
      `layout main with\n  row hud #gap=12:\n    text "x"\nend\n`,
    );
    expect(warnsDotted(diags)).toBe(false);
  });
});
