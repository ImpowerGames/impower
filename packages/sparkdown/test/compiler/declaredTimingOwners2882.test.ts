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
  const { line, withs } = directiveOwners(reading.kind, reading.clauses);
  return {
    line: directiveClauseValues(line),
    withs: withs.map((entry) => ({ name: entry.name?.text, ...directiveClauseValues(entry.clauses) })),
  };
};

describe("each owner gets only the timing words written for it (I-2882)", () => {
  test.each([
    [
      "animate backdrop to left over 4s with shake",
      { line: { to: "left", over: "4s" }, withs: [{ name: "shake" }] },
    ],
    [
      "animate backdrop to left with shake over 1s",
      { line: { to: "left" }, withs: [{ name: "shake", over: "1s" }] },
    ],
    [
      "animate backdrop to left over 1s ease linear with shake",
      { line: { to: "left", over: "1s", ease: "linear" }, withs: [{ name: "shake" }] },
    ],
    [
      "animate backdrop to left after 1s with shake",
      { line: { to: "left", after: "1s" }, withs: [{ name: "shake" }] },
    ],
    [
      "animate backdrop to left over 4s with shake after 3s over 1s wait",
      { line: { to: "left", over: "4s", wait: true }, withs: [{ name: "shake", after: "3s", over: "1s" }] },
    ],
    [
      "animate portrait with shake over 1s with spin over 5s",
      { line: {}, withs: [{ name: "shake", over: "1s" }, { name: "spin", over: "5s" }] },
    ],
    [
      "animate portrait over 2s with shake",
      { line: { over: "2s" }, withs: [{ name: "shake" }] },
    ],
  ])("the table in part 2 of #2881: `%s`", (content, expected) => {
    expect(owners(content)).toEqual(expected);
  });

  test("a `with` takes none of `over`, `after` and `ease` from the line, and the line none from a `with`", () => {
    expect(owners("animate portrait after 1s with shake ease linear with spin over 2s")).toEqual({
      line: { after: "1s" },
      withs: [
        { name: "shake", ease: "linear" },
        { name: "spin", over: "2s" },
      ],
    });
    expect(owners("animate backdrop to left with shake after 1s over 2s ease linear with spin over 5s")).toEqual({
      line: { to: "left" },
      withs: [
        { name: "shake", after: "1s", over: "2s", ease: "linear" },
        { name: "spin", over: "5s" },
      ],
    });
    expect(owners("open inventory over 0.3s with shake")).toEqual({
      line: { over: "0.3s" },
      withs: [{ name: "shake" }],
    });
  });
});

const URI = "file://proj/main.sd";

function warningsOn(line: string): string[] {
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
    .filter((d: any) => d.severity === 2 && d.range.start.line === 1)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      const from = doc.offsetAt(d.range.start);
      return `${doc.read(from, doc.offsetAt(d.range.end))}: ${message}`;
    });
}

describe("a line-owned timing word that times nothing is warned about (I-2882)", () => {
  test.each([
    ["[[animate portrait over 2s with shake]]", "over 2s", "over"],
    ["[[animate portrait after 1s with shake wait]]", "after 1s", "after"],
    ["[[animate portrait ease linear with shake]]", "ease linear", "ease"],
  ])("`%s` warns on `%s`", (line, range, keyword) => {
    expect(warningsOn(line)).toEqual([
      `${range}: \`${keyword}\` times nothing here: this line has no show, hide or travel of its own. Write it after the \`with\` it should time.`,
    ]);
  });

  test.each([
    "[[animate backdrop to left over 2s with shake]]",
    "[[animate backdrop dusk over 2s with shake]]",
    "[[show backdrop bg_room over 2s with shake]]",
    "[[hide portrait after 1s with shake]]",
    "[[animate portrait with shake over 2s after 1s ease linear]]",
  ])("no warning on `%s`", (line) => {
    expect(warningsOn(line).filter((warning) => warning.includes("times nothing"))).toEqual([]);
  });
});
