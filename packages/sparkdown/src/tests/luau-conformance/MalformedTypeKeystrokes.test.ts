// A malformed type typed one keystroke at a time reports what a cold compile
// of the same text reports (#1174). The type checker caches each Luau unit
// by its text and the validator re-annotates only the reparsed window, so a
// second keystroke is where a stale syntax error, or a missing one, would
// show. One compiler takes each keystroke as a minimal edit and compiles
// after it; each compile's diagnostics must equal a fresh compiler's, on the
// way to the malformed type and back.
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

/** Every diagnostic of a compile of `URI`, sorted, as text. */
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

/**
 * The texts on the way from `from` to `to`, one keystroke apart: the
 * characters between their common prefix and suffix deleted from the right,
 * then the new ones typed from the left.
 */
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

// A scene before the one edited, so the compile has flows to carry.
const BEFORE = "scene a\n  Hello.\nend\n\n";

const cases: [string, string, string, string[]][] = [
  ["a missing local type in a scene", `${BEFORE}scene s\n  local x: number = 1\nend\n`, `${BEFORE}scene s\n  local x: = 1\nend\n`, ["5:10-5:12 Expected type, got '='"]],
  ["a `::` for a local's `:`", `${BEFORE}scene s\n  local x: number = 1\nend\n`, `${BEFORE}scene s\n  local x :: number = 1\nend\n`, ["5:10-5:12 Expected identifier when parsing expression, got '::'"]],
  ["a table type's field with no name", `${BEFORE}scene s\n  local t: { a: number } = nil\nend\n`, `${BEFORE}scene s\n  local t: { a: number, : string } = nil\nend\n`, ["5:24-5:25 Expected identifier when parsing table field, got ':'"]],
  ["a parameter with no name", "function f(a: number) end\n", "function f(: number) end\n", ["0:11-0:12 Expected identifier when parsing variable name, got ':'"]],
  ["a store type before story", "store x: number = 1\nStory.\n", "store x:\nStory.\n", ["0:8-1:0 Expected type, got <eof>"]],
  ["a scene parameter's `::`", `${BEFORE}scene s(a: number)\nend\n`, `${BEFORE}scene s(a :: number)\nend\n`, ["4:10-4:12 Expected ')' (to close '(' at column 8), got '::'"]],
];

describe("a malformed type typed one keystroke at a time", () => {
  test.each(cases)("%s reports what a cold compile reports at each keystroke", (_name, valid, malformed, errors) => {
    // The malformed end state is the one pinned, so the comparison is not vacuous.
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
    for (const step of [...keystrokes(valid, malformed), ...keystrokes(malformed, valid)]) {
      version += 1;
      compiler.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges: [{ range: { start: posAt(text, step.at), end: posAt(text, step.at + step.remove) }, text: step.insert }],
      });
      text = step.text;
      expect(diagnosticsOf(compiler), JSON.stringify(text)).toEqual(cold(text));
    }
    expect(text).toBe(valid);
  });
});
