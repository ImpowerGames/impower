import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../src/compiler/classes/SparkdownDocumentRegistry";

const URI = "file://proj/main.sd";

const UNSEEN =
  "This `with` is not seen: the picture is hidden at once. Give the hide a length (`over 1s`), a delay (`after 1s`) or a transition (`using fade`).";

function warningsOn(line: string, prelude = ""): string[] {
  const source = `${prelude}scene start\n  ${line}\n  Hello.\nend\n`;
  const lineNumber = prelude.split("\n").length;
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  const documents = new SparkdownDocumentRegistry([]);
  documents.set({ textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" } });
  const doc = documents.get(URI)!;
  return (result.program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.severity === 2 && d.range.start.line === lineNumber)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      const from = doc.offsetAt(d.range.start);
      return `${doc.read(from, doc.offsetAt(d.range.end))}: ${message}`;
    });
}

const unseen = (line: string, prelude?: string) => warningsOn(line, prelude).filter((warning) => warning.includes("is not seen"));

const TIMED_HIDE = `animation hide {
  target = layer.self
  keyframes {
    {
      opacity = "0"
    }
  }
  timing {
    duration = "0.5s"
  }
}

`;

describe("a `with` on a `hide` line that cannot be seen is warned about (I-2884)", () => {
  test("`[[hide portrait with spin over 1s once]]` warns on the `with`", () => {
    expect(unseen("[[hide portrait with spin over 1s once]]")).toEqual([`with spin: ${UNSEEN}`]);
  });

  test("every `with` on such a line that sets no opacity is warned about", () => {
    expect(unseen("[[hide portrait with spin over 1s once with shake]]")).toEqual([
      `with spin: ${UNSEEN}`,
      `with shake: ${UNSEEN}`,
    ]);
  });

  test("a `with` whose animation sets opacity is seen over the instant hide, so it gets no warning", () => {
    expect(unseen("[[hide portrait with pulse over 1s once]]")).toEqual([]);
    expect(unseen("[[hide portrait with fade over 1s]]")).toEqual([]);
    expect(unseen("[[hide portrait with pulse over 1s once with shake]]")).toEqual([`with shake: ${UNSEEN}`]);
  });

  test.each([
    "[[hide portrait over 1s with spin once]]",
    "[[hide portrait after 1s with spin over 1s once]]",
    "[[hide portrait using fade with spin over 1s once]]",
    "[[hide portrait]]",
    "[[show portrait with spin over 1s once]]",
    "[[animate portrait with spin over 1s once]]",
  ])("no warning on `%s`", (line) => {
    expect(unseen(line)).toEqual([]);
  });

  test("no warning when the project's `hide` animation declares a duration", () => {
    expect(unseen("[[hide portrait with spin over 1s once]]", TIMED_HIDE)).toEqual([]);
  });
});
