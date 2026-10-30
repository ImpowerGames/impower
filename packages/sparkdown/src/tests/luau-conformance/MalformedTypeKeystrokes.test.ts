import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { diagnoseDetailed, diagnosticMessage } from "./diagnosticTestHarness";

const URI = "inmemory:///main.sd";

const file = (text: string) => ({ uri: URI, type: "script" as const, name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" });

function posAt(text: string, offset: number) {
  let line = 0;
  let lineStart = 0;
  for (let i = 0; i < offset; i++) {
    if (text[i] === "\n") {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, character: offset - lineStart };
}

function diagnosticsOf(compiler: SparkdownCompiler): string[] {
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  return (program.diagnostics?.[URI] ?? [])
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${d.severity} ${d.code} ${diagnosticMessage(d)}`)
    .sort();
}

function cold(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({ files: [file(text)] });
  return diagnosticsOf(compiler);
}

function keystrokes(from: string, to: string): { at: number; remove: number; insert: string; text: string }[] {
  let prefix = 0;
  while (prefix < from.length && prefix < to.length && from[prefix] === to[prefix]) prefix++;
  let suffix = 0;
  while (suffix < from.length - prefix && suffix < to.length - prefix && from[from.length - 1 - suffix] === to[to.length - 1 - suffix]) suffix++;
  const steps: { at: number; remove: number; insert: string; text: string }[] = [];
  let text = from;
  for (let end = from.length - suffix; end > prefix; end--) {
    text = text.slice(0, end - 1) + text.slice(end);
    steps.push({ at: end - 1, remove: 1, insert: "", text });
  }
  for (const [i, char] of [...to.slice(prefix, to.length - suffix)].entries()) {
    text = text.slice(0, prefix + i) + char + text.slice(prefix + i);
    steps.push({ at: prefix + i, remove: 0, insert: char, text });
  }
  return steps;
}

const BEFORE = "scene start\n  Hello.\nend\n\n";

const cases: [string, string, string, string[], boolean][] = [
  ["a missing local type in a scene", `${BEFORE}scene s\n  local x: number = 1\nend\n`, `${BEFORE}scene s\n  local x: = 1\nend\n`, ["5:10-5:12 Expected type, got '='"], true],
  ["a `::` for a local's `:`", `${BEFORE}scene s\n  local x: number = 1\nend\n`, `${BEFORE}scene s\n  local x :: number = 1\nend\n`, ["5:10-5:12 Expected identifier when parsing expression, got '::'"], true],
  ["a table type's field with no name", `${BEFORE}scene s\n  local t: { a: number } = nil\nend\n`, `${BEFORE}scene s\n  local t: { a: number, : string } = nil\nend\n`, ["5:24-5:25 Expected identifier when parsing table field, got ':'"], true],
  ["a parameter with no name", `${BEFORE}function f(a: number) end\n`, `${BEFORE}function f(: number) end\n`, ["4:11-4:12 Expected identifier when parsing variable name, got ':'"], false],
  ["a store type before story", `${BEFORE}store x: number = 1\nStory.\n`, `${BEFORE}store x:\nStory.\n`, ["5:0-5:6 statement must be inside a scene or branch; the top level holds declarations only", "4:8-5:0 Expected type, got <eof>"], true],
  ["a scene parameter's `::`", `${BEFORE}scene s(a: number)\nend\n`, `${BEFORE}scene s(a :: number)\nend\n`, ["4:10-4:12 Expected ')' (to close '(' at column 8), got '::'"], true],
];

describe("a malformed type typed one keystroke at a time", () => {
  test.each(cases)("%s reports what a cold compile reports at each keystroke", (_name, valid, malformed, errors, reuses) => {
    expect(
      diagnoseDetailed(malformed)
        .filter((d) => d.code !== "LocalUnused")
        .map((d) => `${d.range!.start.line}:${d.range!.start.character}-${d.range!.end.line}:${d.range!.end.character} ${d.message}`),
    ).toEqual(errors);
    const compiler = new SparkdownCompiler();
    compiler.configure({ files: [file(valid)] });
    diagnosticsOf(compiler);
    let text = valid;
    let version = 1;
    let reused = 0;
    for (const step of [...keystrokes(valid, malformed), ...keystrokes(malformed, valid)]) {
      version += 1;
      compiler.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges: [{ range: { start: posAt(text, step.at), end: posAt(text, step.at + step.remove) }, text: step.insert }],
      });
      text = step.text;
      expect(diagnosticsOf(compiler), JSON.stringify(text)).toEqual(cold(text));
      reused += compiler.typecheckStats.reused;
    }
    expect(text).toBe(valid);
    if (reuses) expect(reused).toBeGreaterThan(0);
  });
});
