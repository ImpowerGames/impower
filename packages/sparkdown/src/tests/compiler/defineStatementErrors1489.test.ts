// A statement written as a line of a `define` body reports every error
// Luau's parser reports for it, in Luau's words at Luau's range, once
// (I-1489): a call with a missing operand reports its error once (I-1484),
// and a statement with several errors reports each of them (I-1488). The
// reference is the official parser's reading of the body as a block, the
// define's header read as `do`, so the define's own `end` closes the block
// as it closes the body: a statement cut before it reports what Luau
// reports there. An incremental compile reports what a cold one does.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { inPositionOrder, officialErrorList } from "./officialSyntax";
import { messageOf } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const HEADER = "define X with";

function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

/** Every error, as `start-end message` in 0-based lines and characters, in position order. */
function errorsOf(compiler: SparkdownCompiler): string[] {
  return inPositionOrder(
    (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
      .filter((d) => d.severity === DiagnosticSeverity.Error)
      .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`),
  );
}

const errors = (text: string) => errorsOf(newCompiler(text));

/** The official parser's errors for a define body, read as a `do` block the define's `end` closes. */
const official = (body: string) => officialErrorList(`do\n${body}end\n`);

const define = (body: string) => `${HEADER}\n${body}end\n`;

/** The position of `offset` in `text`, as an LSP position. */
function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

// A function ahead of the form, whose `0` an edit makes longer: the edit is
// away from the form, on a line before it, and changes no line count. Two
// edits inside the body follow: a property line written above its first
// line, and a space typed at the end of its first line.
const PADDING = "function padding()\n  local p = 0\nend\n";

/** Asserts that each edit, in `PADDING` ahead of `text` or in its body, reports what a cold compile of the edited text does. */
function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  const body = padded.indexOf("\n", padded.indexOf(HEADER)) + 1;
  for (const [offset, removed, insert] of [
    [padded.indexOf("0"), 1, "10000000000"],
    [padded.indexOf("local p"), 0, "    "],
    [body, 0, "  z = 1\n"],
    [padded.indexOf("\n", body), 0, " "],
  ] as const) {
    const compiler = newCompiler(padded);
    compiler.compile({ textDocument: { uri: URI } } as never);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: positionAt(padded, offset), end: positionAt(padded, offset + removed) }, text: insert }],
    } as never);
    const edited = padded.slice(0, offset) + insert + padded.slice(offset + removed);
    expect(errorsOf(compiler), `after ${JSON.stringify(insert)}`).toEqual(errorsOf(newCompiler(edited)));
  }
}

// Define bodies, each with at least one statement Luau cannot read.
const BODIES: string[] = [
  // I-1484: a missing operand, on a call through a path and a call line.
  "  t.f(1 +)\n",
  "  print(1 +)\n",
  "  t.f(1 +)\n  y = 2\n",
  // I-1488: several errors in one statement.
  "  t.f(1 2 3)\n  y = 2\n",
  "  print(1 2 3)\n",
  "  print(1 2 3)\n  y = 2\n",
  "  t.f(,)\n",
  "  print(,)\n",
  "  t.f(1 2 3)\n  print(4 5)\n",
  // Assignments.
  "  t.a = (1 +)\n",
  "  t.a = f(1 2 3)\n",
  "  t.a, t.b = 1 2\n",
  // Statements cut before the block's own closer.
  "  t.f(1 2\n",
  "  print(1 2\n",
  "  print(1 2 3\n",
  "  y = 2\n  t.f(1 2 3\n",
  // A statement read on into the next line, which begins a statement.
  "  print(1 +\n  t.a = 1\n",
  "  t.f(1 +\n  y = 2\n",
  // A line Luau reads as part of the statement before it: the assignment's
  // values, or the value after a line-ending operator.
  "  Hello\n  Hi, Bob\n  1 + 2\n",
  "  t.a = 1 +\n  2\n",
  "  t.a = 1 +\n  print(2 +)\n",
  // Expressions, one a `.` that no name follows.
  "  Hello there.\n",
  "  Hello\n  1 + 2\n",
  // The same, from a later statement on the line (round 1, gc 3).
  "  t.f(1); t.a, t.b\n  1 + 2\n",
  "  Hello Hi, Bob\n  1 + 2\n",
  // A statement later on a line the reading before consumed begins one of
  // its own (round 1, undirected 1), and read-ahead follows the statement
  // that takes the next token, not the line's first (undirected 2).
  "  t.a, t.b\n  1 + 2; t.f(1 +)\n",
  "  Hello\n  Hi, Bob\n  1 + 2; t.f(1 +)\n",
  "  t.a, t.b\n  1 + 2; Hello\n",
  "  t.f(1); t.a, t.b\n  f(\n    1 +)\n",
  // A line read on into is read whole: a dangling statement, a call
  // candidate holding a later statement, and the line continuing it
  // (round 2, bd 1 and 2).
  "  t.a, t.b\n  1 + 2; there.\n",
  "  t.f(1); t.a, t.b\n  f(1); t.f(2 +)\n",
  "  t.f(1); t.a, t.b\n  f(1)\n  .g(2 +)\n",
  "  t.a, t.b\n  there.\n",
  "  t.a = 1 +\n  there.\n",
  // A `.` no name follows is the reading's like any other error.
  "  there.\n",
  "  y = 1; there.\n",
  "  t.f(1)\n  there.\n",
  // A statement after a property on its line (undirected 3).
  "  y = 1; t.f(2 +)\n",
  "  y = 1; t.f(1 2 3)\n",
  // Lines that continue a statement are its own (round 1, gc 2).
  "  t.f(1 +)\n  .g(2 +)\n",
  "  t.f(1 +)\n  :g(2 +)\n",
  "  t.f(1 +)\n  .g(2 +)\n  .h(3 +)\n",
  "  print(1 2)\n  .g(2 +)\n",
  // Errors the tree checks of a pure-Luau body would report (round 1, gc 1).
  "  t.a = if true then 1\n",
  "  t.a = t:do()\n",
  // A type where a statement's value stands.
  "  t.f(x :: )\n",
  "  print(x :: )\n",
];

describe("a define body statement reports every Luau error once (I-1489)", () => {
  for (const body of BODIES) {
    test(JSON.stringify(body), () => {
      const text = define(body);
      expect(errors(text)).toEqual(official(body));
      expectIncrementalEqualsCold(text);
    });
  }

  test("a statement Luau reads reports nothing", () => {
    for (const body of ["  t.f(1)\n", "  print(1)\n  y = 2\n", "  t.a = 1\n"]) {
      expect(official(body), body).toEqual([]);
      expect(errors(define(body)), body).toEqual([]);
    }
  });
});
