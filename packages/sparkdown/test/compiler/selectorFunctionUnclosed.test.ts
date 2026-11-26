import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";

const MISSING = "Missing ')' to close the selector's parameter list";

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
        `${d.range?.start?.line}:${d.range?.start?.character}-${d.range?.end?.character} ${message}`,
      );
    }
  }
  return out;
}

describe("unclosed selector function parameter list", () => {
  test("reports an unclosed @theme(", () => {
    expect(
      diagnose("style card {\n  @theme(dark {\n    color = white\n  }\n}\n"),
    ).toContain(`1:8-9 ${MISSING}`);
  });

  test("reports an unclosed @has(", () => {
    expect(
      diagnose("style card {\n  @has(button {\n    color = white\n  }\n}\n"),
    ).toContain(`1:6-7 ${MISSING}`);
  });

  test("reports the unclosed outer list of a nested selector", () => {
    const diagnostics = diagnose(
      "style card {\n  @has(@has(icon) {\n    color = red\n  }\n}\n",
    );
    expect(diagnostics).toContain(`1:6-7 ${MISSING}`);
    expect(diagnostics.filter((d) => d.includes(MISSING))).toHaveLength(1);
  });

  test.each([
    ["@nth-child(2n of card {", "1:12-13"],
    ["@nth-last-child(odd {", "1:17-18"],
    ["@host(card {", "1:7-8"],
  ])("reports the unclosed list of %s at its paren", (selector, range) => {
    expect(diagnose(`style card {\n  ${selector}\n    color = red\n  }\n}\n`)).toContain(`${range} ${MISSING}`);
  });

  test("closed nth and host functions report nothing", () => {
    const diagnostics = diagnose(
      "style card {\n  @nth-child(2n of card, icon) {\n    color = red\n  }\n  @host(card) {\n    color = red\n  }\n}\n",
    );
    expect(diagnostics.filter((d) => d.includes(MISSING))).toEqual([]);
  });

  test("closed selector functions report nothing", () => {
    const diagnostics = diagnose(
      "style card {\n  @theme(dark) {\n    color = white\n  }\n  @has(button) {\n    color = red\n  }\n  @has(@has(icon)) {\n    color = blue\n  }\n}\n",
    );
    expect(diagnostics.filter((d) => d.includes(MISSING))).toEqual([]);
  });
});
