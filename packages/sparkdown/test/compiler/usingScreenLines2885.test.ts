import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../src/compiler/classes/SparkdownDocumentRegistry";

const URI = "file://proj/main.sd";

const LAYOUTS = `screen main {
}
layout inventory in main {
  text "Bag"
}
`;

function issuesOn(line: string): string[] {
  const source = `${LAYOUTS}\nscene start\n  ${line}\n  Hello.\nend\n`;
  const lineIndex = source.split("\n").findIndex((text) => text === `  ${line}`);
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  const documents = new SparkdownDocumentRegistry([]);
  documents.set({ textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" } });
  const doc = documents.get(URI)!;
  return (result.program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.range.start.line === lineIndex)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      const from = doc.offsetAt(d.range.start);
      return `${d.severity === 1 ? "error" : "warning"} ${doc.read(from, doc.offsetAt(d.range.end))}: ${message}`;
    });
}

describe("`using` on `open`, `close` and `navigate` (I-2885)", () => {
  test.each([
    "[[open inventory using fade]]",
    "[[open inventory using fade over 0.3s with shake over 0.5s]]",
    "[[close inventory with shake using fade after 1s]]",
    "[[navigate main to inventory using fade]]",
    "[[navigate main to inventory with shake using fade over 1s]]",
  ])("`%s` has no issue", (line) => {
    expect(issuesOn(line)).toEqual([]);
  });

  test.each([
    ["[[open inventory using fade with shake using screenfade]]", "open inventory using fade with shake"],
    ["[[close inventory using fade using screenfade]]", "close inventory using fade with shake"],
    ["[[navigate main to inventory using fade using screenfade]]", "navigate main to inventory using fade with shake"],
  ])("a second `using` on `%s` is an error on the second `using`", (line, example) => {
    expect(issuesOn(line)).toEqual([`error using: A line takes one \`using\`\n> e.g. \`[[${example}]]\``]);
  });

  test("an animation after `using` on a screen line is an error on its name", () => {
    expect(issuesOn("[[open inventory using shake]]")).toEqual(["error shake: `shake` is an animation: write `with shake`"]);
  });
});
