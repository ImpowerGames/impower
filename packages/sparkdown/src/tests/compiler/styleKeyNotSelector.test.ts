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

const style = (key: string) =>
  `style text {\n  ${key} {\n    color = red\n  }\n}\nscene start\nHello!\nend\n`;

describe("style block key that is not a selector", () => {
  test("warns on a property assignment used as a block key", () => {
    expect(diagnose(style("variant=left"))).toEqual([
      "1:2-14 2 `variant=left` is not a selector, so this block never applies\n> Write `#variant=left` or `[variant=left]` to match the attribute",
    ]);
  });

  test("warns when the assignment is spaced", () => {
    expect(diagnose(style("speaker = bunny"))).toEqual([
      "1:2-17 2 `speaker = bunny` is not a selector, so this block never applies\n> Write `#speaker=bunny` or `[speaker=bunny]` to match the attribute",
    ]);
  });

  test.each(["#variant=left", "[variant=left]", ">> *", "@hovered", "#variant:left"])(
    "reports nothing new for `%s`",
    (key) => {
      expect(
        diagnose(style(key)).filter((d) => d.includes("is not a selector")),
      ).toEqual([]);
    },
  );
});
