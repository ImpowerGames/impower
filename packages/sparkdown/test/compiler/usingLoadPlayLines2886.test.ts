import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../src/compiler/classes/SparkdownDocumentRegistry";

const URI = "file://proj/main.sd";

function issuesOn(line: string): string[] {
  const source = `scene start\n  ${line}\n  Hello.\nend\n\nscene chapter2\n  Bye.\nend\n`;
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  const documents = new SparkdownDocumentRegistry([]);
  documents.set({ textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" } });
  const doc = documents.get(URI)!;
  return (result.program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.range.start.line === 1)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      const from = doc.offsetAt(d.range.start);
      return `${d.severity === 1 ? "error" : "warning"} ${doc.read(from, doc.offsetAt(d.range.end))}: ${message}`;
    })
    .filter((issue: string) => !/: Cannot find (?:image|video|audio) named/.test(issue));
}

describe("`load` and `play` lines name their transition with `using` (I-2886)", () => {
  test.each([
    "[[load chapter2 using fade]]",
    "[[play intro using fade]]",
    "[[play intro loop mute using fade]]",
  ])("`%s` has no issue", (line) => {
    expect(issuesOn(line)).toEqual([]);
  });

  test.each([
    ["[[load chapter2 with fade]]", "load"],
    ["[[play intro with fade]]", "play"],
  ])("a transition after `with` on `%s` is an error on the `with`", (line, control) => {
    expect(issuesOn(line)).toEqual([
      `error with: A \`${control}\` line names its transition with \`using\`: write \`using fade\``,
    ]);
  });

  test.each([
    ["[[load chapter2 with shake]]", "load", "load chapter2"],
    ["[[play intro with shake]]", "play", "play intro"],
  ])("a `with` naming no transition on `%s` is an error on the `with`", (line, control, example) => {
    expect(issuesOn(line).filter((issue) => issue.startsWith("error with:"))).toEqual([
      `error with: A \`${control}\` line names its transition with \`using\`\n> e.g. \`[[${example} using fade]]\``,
    ]);
  });

  test.each([
    ["[[load chapter2 with fade with shake]]", "load"],
    ["[[play intro with fade with shake]]", "play"],
  ])("each of two `with` clauses on `%s` is an error on its `with`", (line, control) => {
    expect(issuesOn(line).filter((issue) => issue.startsWith("error with:"))).toEqual([
      `error with: A \`${control}\` line names its transition with \`using\`: write \`using fade\``,
      `error with: A \`${control}\` line names its transition with \`using\`\n> e.g. \`[[${control === "load" ? "load chapter2" : "play intro"} using fade]]\``,
    ]);
  });

  test.each(["[[load chapter2 using fade using screenfade]]", "[[play intro using fade using screenfade]]"])(
    "a second `using` on `%s` is an error on the second `using`",
    (line) => {
      expect(issuesOn(line)).toEqual([
        "error using: A line takes one `using`\n> e.g. `[[show portrait hero using fade with shake]]`",
      ]);
    },
  );

  test("a sound line still takes one `with`", () => {
    expect(issuesOn("((play music theme with echo with echo))").filter((issue) => issue.startsWith("error with:"))).toEqual([
      "error with: A sound line takes one `with`\n> e.g. `((play music theme with echo))`",
    ]);
  });
});
