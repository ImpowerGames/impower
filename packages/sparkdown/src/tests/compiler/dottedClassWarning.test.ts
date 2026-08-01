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

describe("a CSS-nesting selector is not a dotted class", () => {
  // `&.secondary:` compiles to a real, populated compound rule (`builtins.sd`
  // uses the idiom 13 times), and taking the suggested fix turns it into a
  // descendant TYPE selector matching nothing — with no further warning. The
  // advice was not just noise; following it silently broke working styles.
  for (const selector of [
    "&.secondary",
    "&.outline.secondary",
    "> .child",
    "* .thing",
  ]) {
    test(`\`${selector}:\` does not warn`, () => {
      expect(
        warnsDotted(
          diagnosticsFor(
            `style card with\n  ${selector}:\n    color = blue\nend\n`,
          ),
        ),
      ).toBe(false);
    });
  }
});
