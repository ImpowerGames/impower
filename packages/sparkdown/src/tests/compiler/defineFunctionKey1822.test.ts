import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

function errors(source: string): string[] {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  const messages: string[] = [];
  for (const list of Object.values(result.program.diagnostics ?? {})) {
    for (const d of list as any[]) {
      if (d.severity === 1) {
        messages.push(
          typeof d.message === "string" ? d.message : d.message?.value,
        );
      }
    }
  }
  return messages;
}

describe("a define property keyed by `function`", () => {
  test.each(["if", "repeat", "local", "function"])(
    "`%s = 3` is a property and the define keeps its end",
    (key) => {
      expect(errors(`define box with\n  ${key} = 3\nend\n\nscene start\nend\n`)).toEqual([]);
    },
  );

  test("method headers in a define body stay methods", () => {
    const source = [
      "define box with",
      "  function = 3",
      "  function greet()",
      "    return 1",
      "  end",
      "end",
      "",
      "scene start",
      "end",
      "",
    ].join("\n");
    expect(errors(source)).toEqual([]);
  });
});
