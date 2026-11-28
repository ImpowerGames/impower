import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../src/compiler/classes/SparkdownDocumentRegistry";
import {
  directiveClauseValues,
  directiveOwners,
  readDirective,
} from "../../src/compiler/utils/readDirective";

const owners = (content: string) => {
  const reading = readDirective("image", content);
  const { line, withs, using } = directiveOwners(reading.kind, reading.clauses);
  return {
    using: using?.value?.text,
    line: directiveClauseValues(line),
    withs: withs.map((entry) => ({ name: entry.name?.text, ...directiveClauseValues(entry.clauses) })),
  };
};

describe("the shared reading gives the line its `using` (I-2883)", () => {
  test.each([
    [
      "`using` before a `with`",
      "show portrait hero using fade over 2s with shake",
      { using: "fade", line: { using: "fade", over: "2s" }, withs: [{ name: "shake" }] },
    ],
    [
      "`using` between two `with` clauses",
      "show portrait hero with shake over 1s using fade over 2s with spin after 1s",
      { using: "fade", line: { using: "fade", over: "2s" }, withs: [{ name: "shake", over: "1s" }, { name: "spin", after: "1s" }] },
    ],
    [
      "`using` after the last `with`",
      "hide portrait with spin over 1s once using fade after 1s ease linear",
      { using: "fade", line: { using: "fade", after: "1s", ease: "linear" }, withs: [{ name: "spin", over: "1s", once: true }] },
    ],
    [
      "`loop` and `once` after `using`",
      "show backdrop clip with shake using fade loop",
      { using: "fade", line: { using: "fade", loop: true }, withs: [{ name: "shake" }] },
    ],
    [
      "a line with no `using`",
      "show portrait hero over 2s with shake",
      { using: undefined, line: { over: "2s" }, withs: [{ name: "shake" }] },
    ],
  ])("%s: `%s`", (_label, content, expected) => {
    expect(owners(content)).toEqual(expected);
  });

  test("a second `using` is read as the line's, the later one kept", () => {
    expect(owners("show portrait hero using fade with shake using screenfade over 1s")).toEqual({
      using: "screenfade",
      line: { using: "screenfade", over: "1s" },
      withs: [{ name: "shake" }],
    });
  });
});

const URI = "file://proj/main.sd";

function issuesOn(line: string): string[] {
  const source = `scene start\n  ${line}\n  Hello.\nend\n`;
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
    .filter((issue: string) => !/: Cannot find (?:image|audio) named/.test(issue));
}

describe("`using` is checked on the word or name it concerns (I-2883)", () => {
  test.each([
    "[[show portrait hero using fade over 2s with shake]]",
    "[[hide portrait using fade over 1s with spin over 1s once]]",
    "[[hero using screenfade]]",
    "[[animate backdrop dusk using fade]]",
    "[[show portrait hero with shake using fade after 1s]]",
  ])("`%s` has no issue", (line) => {
    expect(issuesOn(line)).toEqual([]);
  });

  test("a second `using` is an error on the second `using`", () => {
    expect(issuesOn("[[show portrait hero using fade with shake using screenfade]]")).toEqual([
      "error using: A line takes one `using`\n> e.g. `[[show portrait hero using fade with shake]]`",
    ]);
  });

  test("an animation after `using` is an error on its name", () => {
    expect(issuesOn("[[show portrait hero using shake]]")).toEqual(["error shake: `shake` is an animation: write `with shake`"]);
  });

  test("a name after `using` that is neither kind is not found, as a `with` name is", () => {
    expect(issuesOn("[[show portrait hero using nothing_here]]")).toEqual([
      "warning nothing_here: Cannot find transition named `nothing_here`",
    ]);
  });

  test("`using` with no name is an error after the word", () => {
    expect(issuesOn("[[show portrait hero using]]")).toEqual([
      "error : `using` should be followed by the name of a transition\n> e.g. `using fade`",
    ]);
  });

  test("`using` on an `animate` that names no picture is an error on `using`", () => {
    expect(issuesOn("[[animate backdrop using fade]]")).toEqual([
      "error using: `using` names how the picture an `animate` adds arrives, and this `animate` names no picture\n> e.g. `[[animate backdrop dusk using fade]]`",
    ]);
  });

  test("`using` on a sound line is an error on `using`", () => {
    expect(issuesOn("((play music theme using fade))")).toEqual([
      "error using: `using` names how a picture arrives or leaves, so it does not belong on a sound line\n> e.g. `[[show portrait hero using fade]]`",
    ]);
  });

  test.each([
    ["[[load chapter2 using fade]]", "load", "load chapter2"],
    ["[[play intro using fade]]", "play", "play intro"],
  ])("`using` on `%s` is an error on `using`", (line, control, example) => {
    expect(issuesOn(line).filter((issue) => issue.startsWith("error using:"))).toEqual([
      `error using: \`using\` belongs on a picture or screen line: a \`${control}\` line names its transition with \`with\`\n> e.g. \`[[${example} with fade]]\``,
    ]);
  });
});
