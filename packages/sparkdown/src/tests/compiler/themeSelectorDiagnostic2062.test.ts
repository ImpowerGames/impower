import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const THEME = "`@theme` takes `(light)` or `(dark)`";

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
  `style ink {\n  text-color = slate_20\n  ${selector} {\n    text-color = slate_90\n  }\n}\n`;

const themeDiagnostics = (selector: string) =>
  diagnose(style(selector)).filter((d) => d.includes(THEME));

describe("a mistyped @theme selector is diagnosed (#2062)", () => {
  test.each(["@theme(dark)", "@theme(light)", "@theme( dark )"])("%s is accepted", (selector) => {
    expect(themeDiagnostics(selector)).toEqual([]);
  });

  test.each([
    ["@theme(darkness)", "2:2-18"],
    ["@theme(Dark)", "2:2-14"],
    ["@theme[dark]", "2:2-8"],
    ["@theme", "2:2-8"],
  ])("%s is a warning on the selector", (selector, range) => {
    const found = themeDiagnostics(selector);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(new RegExp(`^${range.replace(/[-:]/g, "\\$&")} (2|warning) `));
    expect(found[0]).toContain("so this block never applies");
  });

  test("an unclosed @theme( gets only the missing-parenthesis error", () => {
    const found = diagnose(style("@theme(dark"));
    expect(found.filter((d) => d.includes(THEME))).toEqual([]);
    expect(found.some((d) => d.includes("Missing ')' to close the selector's parameter list"))).toBe(true);
  });

  test("another state selector is left alone", () => {
    expect(themeDiagnostics("@hovered")).toEqual([]);
  });
});
