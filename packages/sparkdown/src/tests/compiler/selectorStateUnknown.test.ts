import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function diagnose(source: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: "inmemory:///main.sd",
        type: "script" as const,
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
  for (const list of Object.values(result.program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      const message =
        typeof d.message === "string" ? d.message : (d.message?.value ?? "");
      out.push(
        `${d.range?.start?.line}:${d.range?.start?.character}-${d.range?.end?.character} ${d.severity} ${message}`,
      );
    }
  }
  return out;
}

const style = (selector: string) =>
  `style card {\n  text-color = slate_20\n  ${selector} {\n    text-color = slate_90\n  }\n}\n`;

const unknownStateWarnings = (source: string) =>
  diagnose(source).filter((d) => d.includes("not a known state"));

describe("unknown selector state", () => {
  test("warns on a misspelt state", () => {
    expect(unknownStateWarnings(style("@hoverd"))).toEqual([
      expect.stringMatching(/^2:2-9 2 `@hoverd` is not a known state/),
    ]);
  });

  test("warns on a misspelt state inside a selector function", () => {
    expect(unknownStateWarnings(style("@not(@hoverd)"))).toEqual([
      expect.stringMatching(/^2:7-14 2 `@hoverd` is not a known state/),
    ]);
  });

  test("warns on an unknown name taking parameters", () => {
    expect(unknownStateWarnings(style("@nth-chld(2)"))).toEqual([
      expect.stringMatching(/^2:2-11 2 `@nth-chld` is not a known state/),
    ]);
  });

  test.each([
    "@hovered",
    "@focused",
    "@type_submit",
    "@file-button",
    "@initial",
    "@hover",
    "@focus-visible",
    "@first-child",
    "@nth-child(2)",
    "@has(icon)",
    "@not(@hovered)",
    "@is(@first, @last)",
    "@where(@checked)",
    "@theme(dark)",
    "@direction(rtl)",
    "@language(en)",
    "@screen-size(sm)",
    "@container_size(md)",
    "@hovered @focused",
  ])("accepts %s", (selector) => {
    expect(unknownStateWarnings(style(selector))).toEqual([]);
  });

  test("leaves layout event handlers alone", () => {
    expect(
      unknownStateWarnings(
        "layout main {\n  button @click={ print(1) }\n  button @chnage=score\n}\n",
      ),
    ).toEqual([]);
  });
});
