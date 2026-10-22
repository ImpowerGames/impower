// What stands between a sequential alternator's word (`cycle`, `queue`,
// `chain`, `shuffle`, with its second keyword) and its first `|` is its head,
// which takes no value: any content there is one error at its range, in story
// braces, a block line, a store's value, a function body and a nested
// alternator alike (I-1446). The head is not evaluated, and the alternator
// runs as if it had none. The head's reading errors keep their one owner
// (I-1435, I-1445), and a separator the head's `end` took (I-1408) is no head
// content. A cold compile reports what an edit away from the form does.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

const URI = "inmemory:///main.sd";

function messageOf(d: SparkDiagnostic): string {
  return typeof d.message === "string" ? d.message : (d.message as { value: string }).value;
}

/** Errors, as `start-end message` in 0-based lines and characters, sorted. */
function errorsOf(diagnostics: readonly SparkDiagnostic[]): string[] {
  return diagnostics
    .filter((d) => d.severity === DiagnosticSeverity.Error)
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

function compileErrors(compiler: SparkdownCompiler): string[] {
  return errorsOf(compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? []);
}

function coldErrors(text: string): string[] {
  return compileErrors(newCompiler(text));
}

function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

const PADDING = "function padding()\n  local p = 0\nend\n";

/** Asserts that an edit in `PADDING` ahead of `text` reports what a cold compile of the edited text does. */
function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  const offset = padded.indexOf("0");
  const compiler = newCompiler(padded);
  compiler.compile({ textDocument: { uri: URI } } as never);
  compiler.updateDocument({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [{ range: { start: positionAt(padded, offset), end: positionAt(padded, offset + 1) }, text: "10000" }],
  } as never);
  const edited = padded.slice(0, offset) + "10000" + padded.slice(offset + 1);
  expect(compileErrors(compiler)).toEqual(coldErrors(edited));
}

function output(text: string): string {
  return makeRuntimeStoryFromSource(text).story.ContinueMaximally();
}

/** The error at the first occurrence of `head` in `text` (on one line). */
function headError(text: string, head: string, keywords = "cycle"): string {
  const at = positionAt(text, text.indexOf(head));
  return `${at.line}:${at.character}-${at.line}:${at.character + head.length} A \`${keywords}\` takes no value before its first \`|\`; write its arms as \`| ...\``;
}

// [name, script, head, keywords, the same script with no head]
const FORMS: [string, string, string, string, string][] = [
  ["story braces, a name", "Hello {cycle undefinedName | 'a' | 'b' end}.\n", "undefinedName", "cycle", "Hello {cycle | 'a' | 'b' end}.\n"],
  ["story braces, a call", "Hello {cycle error('boom') | 'a' | 'b' end}.\n", "error('boom')", "cycle", "Hello {cycle | 'a' | 'b' end}.\n"],
  ["story braces, two keywords", "Hello {shuffle queue 1 | 'a' end}.\n", "1", "shuffle queue", "Hello {shuffle queue | 'a' end}.\n"],
  ["story braces, a keyed first arm", "Hello {queue x | k = 'a' | 'b' end}.\n", "x", "queue", "Hello {queue | k = 'a' | 'b' end}.\n"],
  ["a story block", "chain x\n| A\n| B\nend\n", "x", "chain", "chain\n| A\n| B\nend\n"],
  ["a story block, a line under its word", "cycle\nNot an arm.\n| A\n| B\nend\n", "Not an arm.", "cycle", "cycle\n| A\n| B\nend\n"],
  ["a store's value", "store s = cycle 1 | 'a' | 'b' end\nValue {s}.\n", "1", "cycle", "store s = cycle | 'a' | 'b' end\nValue {s}.\n"],
  [
    "a function body",
    "function f()\n  return cycle x | 'a' | 'b' end\nend\nValue {f()}.\n",
    "x",
    "cycle",
    "function f()\n  return cycle | 'a' | 'b' end\nend\nValue {f()}.\n",
  ],
  ["nested in an arm", "Value {cycle | (queue x | 'a' end) | 'b' end}.\n", "x", "queue", "Value {cycle | (queue | 'a' end) | 'b' end}.\n"],
  [
    "compact, an unkeyed first arm",
    'Value {cycle match("x") | x = "a" end| "b" end}.\n',
    'match("x") | x = "a" end',
    "cycle",
    'Value {cycle | "b" end}.\n',
  ],
  [
    "compact, no space after the bar",
    'Value {cycle match("x") | x = "a" end|"b" end}.\n',
    'match("x") | x = "a" end',
    "cycle",
    'Value {cycle |"b" end}.\n',
  ],
  [
    "spaced, after an end",
    'Value {cycle match("x") | x = "a" end | "b" end}.\n',
    'match("x") | x = "a" end',
    "cycle",
    'Value {cycle | "b" end}.\n',
  ],
];

describe("a sequential alternator's head is an error (I-1446)", () => {
  test.each(FORMS)("%s", (_, text, head, keywords, headless) => {
    expect(coldErrors(headless)).toEqual([]);
    expect(coldErrors(text)).toEqual([headError(text, head, keywords)]);
    expect(output(text)).toBe(output(headless));
    expectIncrementalEqualsCold(text);
  });

  test("a head's backtick string reports its own error once, beside the head's", () => {
    const text = "Hello {cycle `a {} b` | 'a' end}.\n";
    const errors = coldErrors(text);
    expect(errors).toContain(headError(text, "`a {} b`"));
    expect(errors.filter((e) => !e.endsWith("`| ...`"))).toHaveLength(1);
    expectIncrementalEqualsCold(text);
  });

  test("a match's head is its condition, not an error", () => {
    expect(coldErrors('store x = "a"\nValue {match x | a = 1 | b = 2 end}.\n')).toEqual([]);
  });
});
