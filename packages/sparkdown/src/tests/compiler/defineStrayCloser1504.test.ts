// A stray block closer (`else`, `elseif` or `until`) written as a line of a `define` body reports Luau's own
// top-level error at the token, `Expected <eof>, got 'else'` (I-1504). A
// define body has no Luau `do`, so the reference is the official parser's
// reading of the body as a chunk, its lines placed where the body puts
// them. A closer that belongs to a block in the body (`if … else … end`)
// reports nothing. An incremental compile reports what a cold one does.
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

const define = (body: string) => `${HEADER}\n${body}end\n`;

/** The official parser's errors for a define body read as a chunk, moved down past the header line. */
const official = (body: string) =>
  officialErrorList(body).map((e) => e.replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, a, b, c, d) => `${+a + 1}:${b}-${+c + 1}:${d}`));

/** The position of `offset` in `text`, as an LSP position. */
function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

/** Asserts that a space typed at the end of the body's first line reports what a cold compile of the edited text does. */
function expectIncrementalEqualsCold(text: string): void {
  const offset = text.indexOf("\n", HEADER.length + 1);
  const compiler = newCompiler(text);
  compiler.compile({ textDocument: { uri: URI } } as never);
  compiler.updateDocument({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [{ range: { start: positionAt(text, offset), end: positionAt(text, offset) }, text: " " }],
  } as never);
  const edited = text.slice(0, offset) + " " + text.slice(offset);
  expect(errorsOf(compiler)).toEqual(errorsOf(newCompiler(edited)));
}

// An `end` written as a body line is the define's own (it closes the
// define, and the `end` after it is the file's), so it is no stray closer.
const CLOSERS = ["else", "elseif", "until"];

const STRAY: string[] = [
  // A lone body line.
  ...CLOSERS.map((c) => `  ${c}\n`),
  // After a statement on the same line.
  ...CLOSERS.map((c) => `  x = 1 ${c}\n`),
  // After a statement on the line before.
  ...CLOSERS.map((c) => `  print(1)\n  ${c}\n`),
  // In a define that is broken elsewhere.
  ...CLOSERS.map((c) => `  t.a = f(1 2)\n  ${c}\n`),
];

// Closers that belong to a block in the body, after a statement the
// statement reading cuts from that block.
const OWN: string[] = [
  "  if a then\n    print(1)\n  else\n    print(2)\n  end\n",
  "  if a then\n    print(1)\n  elseif b then\n    print(2)\n  end\n",
  "  repeat\n    print(1)\n  until a\n",
  "  do\n    print(1)\n  end\n",
];

describe("a stray block closer in a define body reports Luau's error at the token (I-1504)", () => {
  test.each(STRAY)("%j", (body) => {
    const expected = official(body);
    expect(expected.some((e) => /Expected <eof>, got '/.test(e)), "the reference names the closer").toBe(true);
    expect(errorsOf(newCompiler(define(body)))).toEqual(expected);
    expectIncrementalEqualsCold(define(body));
  });

  test.each(OWN)("a block's own closer reports nothing: %j", (body) => {
    expect(official(body)).toEqual([]);
    expect(errorsOf(newCompiler(define(body)))).toEqual([]);
    expectIncrementalEqualsCold(define(body));
  });
});
