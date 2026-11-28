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

describe("which `with` a clause belongs to (I-2853)", () => {
  test.each([
    [
      "animate backdrop to left over 1s with shake",
      { line: { to: "left", over: "1s" }, withs: [{ name: "shake" }] },
    ],
    [
      "animate backdrop to left with shake over 1s",
      { line: { to: "left" }, withs: [{ name: "shake", over: "1s" }] },
    ],
    [
      "animate portrait over 2s with shake with spin over 5s",
      { line: { over: "2s" }, withs: [{ name: "shake" }, { name: "spin", over: "5s" }] },
    ],
    [
      "animate portrait with shake over 1s with spin over 5s",
      { line: {}, withs: [{ name: "shake", over: "1s" }, { name: "spin", over: "5s" }] },
    ],
    [
      "animate backdrop to left over 1s with shake over 2s",
      { line: { to: "left", over: "1s" }, withs: [{ name: "shake", over: "2s" }] },
    ],
  ])("`%s`", (content, expected) => {
    expect(owners(content)).toEqual(expected);
  });

  test("`loop` and `once` belong to the side they are written on", () => {
    expect(owners("show backdrop rain once with fade")).toEqual({
      line: { once: true },
      withs: [{ name: "fade" }],
    });
    expect(owners("show backdrop rain with fade once")).toEqual({
      line: {},
      withs: [{ name: "fade", once: true }],
    });
    expect(owners("animate portrait with shake loop with spin over 2s once")).toEqual({
      line: {},
      withs: [
        { name: "shake", loop: true },
        { name: "spin", over: "2s", once: true },
      ],
    });
    expect(owners("show backdrop rain loop with fade")).toEqual({
      line: { loop: true },
      withs: [{ name: "fade" }],
    });
  });

  test("`at`, `to`, `morph`, `wait`, `mute`, `unmute` and `now` belong to the line wherever they are written", () => {
    expect(owners("animate portrait with shake to left wait mute unmute now morph talk")).toEqual({
      line: { to: "left", wait: true, mute: true, unmute: true, now: true, morph: "talk" },
      withs: [{ name: "shake" }],
    });
    expect(owners("show portrait mia with fade at left")).toEqual({
      line: { at: "left" },
      withs: [{ name: "fade" }],
    });
  });

  test("a clause word written twice for one owner keeps the later value", () => {
    expect(owners("animate portrait over 1s over 2s with shake over 3s over 4s")).toEqual({
      line: { over: "2s" },
      withs: [{ name: "shake", over: "4s" }],
    });
  });

  test("a line with no `with` keeps every clause", () => {
    expect(owners("show portrait mia over 1s after 2s ease linear loop")).toEqual({
      line: { over: "1s", after: "2s", ease: "linear", loop: true },
      withs: [],
    });
  });

  test("screen lines read the same list", () => {
    expect(owners("open inventory with fade over 0.3s with shake over 0.5s")).toEqual({
      line: {},
      withs: [
        { name: "fade", over: "0.3s" },
        { name: "shake", over: "0.5s" },
      ],
    });
  });

  test("`load` and `play` lines keep their present reading of their clauses and play their first `with`", () => {
    expect(owners("load chapter2 with fade over 1s with slide")).toEqual({
      line: { with: "fade", over: "1s" },
      withs: [],
    });
    expect(owners("play intro with fade loop")).toEqual({
      line: { with: "fade", loop: true },
      withs: [],
    });
  });
});

const URI = "file://proj/main.sd";

function errorsOn(line: string): string[] {
  const source = `define transition fade {\n  on_show = "show"\n  on_hide = "hide"\n}\nscene start\n  ${line}\n  Hello.\nend\n`;
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  const documents = new SparkdownDocumentRegistry([]);
  documents.set({ textDocument: { uri: URI, text: source, version: 1, languageId: "sparkdown" } });
  const doc = documents.get(URI)!;
  return (result.program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.severity === 1 && d.range.start.line === 5)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      const from = doc.offsetAt(d.range.start);
      return `${doc.read(from, doc.offsetAt(d.range.end))}@${d.range.start.character}: ${message.split("\n")[0]}`;
    });
}

describe("a second `with` on a `load`, `play` or sound line is an error on that `with` (I-2853)", () => {
  test.each([
    ["[[load start with fade with fade]]", "A `load` line takes one `with`"],
    ["[[play intro with fade with fade]]", "A `play` line takes one `with`"],
    ["((play music theme with echo with echo))", "A sound line takes one `with`"],
  ])("`%s`", (line, message) => {
    const secondWith = 2 + line.lastIndexOf("with");
    expect(errorsOn(line).filter((error) => error.includes("takes one `with`"))).toEqual([`with@${secondWith}: ${message}`]);
  });

  test.each([
    "[[animate portrait with fade with fade]]",
    "[[show portrait with fade with fade]]",
    "[[portrait with fade with fade]]",
    "[[open menu with fade with fade]]",
  ])("no error on a picture or screen line: `%s`", (line) => {
    expect(errorsOn(line).filter((error) => error.includes("takes one `with`"))).toEqual([]);
  });
});
