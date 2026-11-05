import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

const MISSING = "Missing ')' to close the function's parameter list";
const SEMICOLON = `${MISSING} before ';', which ends the property`;

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

describe("unclosed styling value function parameter list", () => {
  test("reports an unclosed @theme( value that wraps to the next line", () => {
    const diagnostics = diagnose(
      "style card {\n  @theme(dark\n  ) {\n    color = gray\n  }\n}\n",
    );
    expect(diagnostics).toContain(`1:8-9 ${MISSING}`);
    expect(diagnostics.filter((d) => d.includes(MISSING))).toHaveLength(1);
  });

  test("reports an unclosed function in a property value", () => {
    const diagnostics = diagnose(
      "style card {\n  color = rgb(1, 2, 3\n}\n",
    );
    expect(diagnostics).toContain(`1:13-14 ${MISSING}`);
  });

  test("reports only the unclosed outer list of a nested function", () => {
    const diagnostics = diagnose(
      "style card {\n  width = calc(min(1px, 2px) + 3px\n}\n",
    );
    expect(diagnostics).toContain(`1:14-15 ${MISSING}`);
    expect(diagnostics.filter((d) => d.includes(MISSING))).toHaveLength(1);
  });

  test("names the ';' that ends the property before the list closes", () => {
    for (const source of [
      "style panel {\n  background-color = rgb(1; 2; 3)\n}\n",
      "style panel {\n  background-color = rgb(1 ; 2; 3)\n}\n",
    ]) {
      const diagnostics = diagnose(source);
      expect(diagnostics).toContain(`1:24-25 ${SEMICOLON}`);
      expect(diagnostics.filter((d) => d.endsWith(MISSING))).toEqual([]);
    }
  });

  test("reports an unclosed list whose last argument is a closed color", () => {
    const diagnostics = diagnose(
      "style card {\n  background_image = linear-gradient(rgba(0, 0, 0, 0) 0%, hsl(0, 0%, 0%)\n}\n",
    );
    expect(diagnostics).toContain(`1:36-37 ${MISSING}`);
    expect(diagnostics.filter((d) => d.includes(MISSING))).toHaveLength(1);
  });

  test("closed styling functions report nothing", () => {
    const diagnostics = diagnose(
      "style card {\n  @theme(dark) {\n    color = gray\n  }\n  color = rgb(1, 2, 3)\n  width = calc(min(1px, 2px) + 3px)\n  background_image = linear-gradient(to bottom, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) 100%)\n  border_image = linear-gradient(hsla(0, 0%, 0%, 0) 0%, hsl(0, 0%, 0%) 100%)\n}\n",
    );
    expect(diagnostics.filter((d) => d.includes(MISSING))).toEqual([]);
  });
});
