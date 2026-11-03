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
  test("a dotted class on a container element does not warn", () => {
    const diags = diagnosticsFor(
      `layout main {\n  row.hud #gap=12 {\n    text "x"\n  }\n}\nscene start\nend\n`,
    );
    expect(diags).toEqual([]);
  });

  test("a dotted class on a content element does not warn", () => {
    const diags = diagnosticsFor(`layout main {\n  text.title "Hi"\n}\nscene start\nend\n`);
    expect(diags).toEqual([]);
  });

  test("a dotted class in a brace block does not warn", () => {
    const diags = diagnosticsFor(
      `layout main {\n  row.hud #gap=12 { text.title "Hi" }\n}\nscene start\nend\n`,
    );
    expect(diags).toEqual([]);
  });
});

describe("a CSS-nesting selector is not a dotted class", () => {
  for (const selector of [
    "&.secondary",
    "&.outline.secondary",
    "> .child",
    "* .thing",
  ]) {
    test(`\`${selector} { … }\` does not warn`, () => {
      expect(
        warnsDotted(
          diagnosticsFor(
            `style card {\n  ${selector} {\n    color = blue\n  }\n}\n`,
          ),
        ),
      ).toBe(false);
    });
  }
});
