// #1715: a divert target misused as a value holds no position of its own, so
// its diagnostics landed at line 0 column 0 at the top level and were dropped
// (logged HIDDEN) inside a scene. They are reported on the target's name, as
// the divert reports `target not found` and #1703 reports `-> DONE`.
//
// The third diagnostic of `DivertTarget.ResolveWith`, storing a target with
// by-reference arguments, gets the same placement but cannot be reached from
// authored syntax: no syntax declares a by-reference parameter
// (programFlowParameters.test.ts).
import { describe, expect, it } from "vitest";
import { testCompiler } from "../engineUnderTest";

const URI = "file:///main.sd";

function compile(text: string) {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri: URI } } as never)
    .program as any;
}

function matching(program: any, pattern: RegExp) {
  return (program.diagnostics?.[URI] ?? [])
    .map((d: any) => ({
      message: typeof d.message === "string" ? d.message : d.message?.value,
      severity: d.severity,
      line: d.range.start.line,
      start: d.range.start.character,
      end: d.range.end.character,
      endLine: d.range.end.line,
    }))
    .filter((d: any) => pattern.test(d.message))
    .map(({ message: _m, ...rest }: any) => rest);
}

/** Where `target` is written on `line` of `text`, after the arrow. */
function rangeOf(text: string, line: number, target: string) {
  const lineText = text.split("\n")[line]!;
  const start = lineText.indexOf(`-> ${target}`) + 3;
  expect(start).toBeGreaterThanOrEqual(3);
  return { line, start, end: start + target.length, endLine: line };
}

const MISUSE = /divert target like that/;
const ARROW = /shouldn't be preceded by '->'/;

describe("a divert target misused as a value", () => {
  it.each([
    [
      "in a scene",
      "-> start\n\nscene start\n  local r = (-> other) + 1\n  Hello.\nend\n\nscene other\n  Hi.\nend\n",
      3,
    ],
    [
      "at the top level",
      "store r = (-> other) + 1\n\nHello.\n\nscene other\n  Hi.\nend\n",
      0,
    ],
  ])("%s warns on the target's name", (_name, text, line) => {
    expect(matching(compile(text), MISUSE)).toEqual([
      { severity: 2, ...rangeOf(text, line, "other") },
    ]);
  });
});

describe("a variable preceded by '->'", () => {
  it.each([
    ["at the top level", "store x = 1\nstore r = -> x\n\nHello.\n", 1],
    [
      "in a scene",
      "-> start\n\nscene start\n  store x = 1\n  local r = -> x\n  Hello.\nend\n",
      4,
    ],
  ])("%s is reported on the variable's name", (_name, text, line) => {
    expect(matching(compile(text), ARROW)).toEqual([
      { severity: 1, ...rangeOf(text, line, "x") },
    ]);
  });
});
