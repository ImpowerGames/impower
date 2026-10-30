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
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: `${text}scene start\nend\n`, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

function errorsOf(compiler: SparkdownCompiler): string[] {
  return inPositionOrder(
    (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
      .filter((d) => d.severity === DiagnosticSeverity.Error)
      .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`),
  );
}

const define = (body: string) => `${HEADER}\n${body}end\n`;

const official = (body: string) =>
  officialErrorList(body).map((e) => e.replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, a, b, c, d) => `${+a + 1}:${b}-${+c + 1}:${d}`));

function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

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

const CLOSERS = ["else", "elseif", "until"];

const STRAY: string[] = [
  ...CLOSERS.map((c) => `  ${c}\n`),
  ...CLOSERS.map((c) => `  x = 1 ${c}\n`),
  ...CLOSERS.map((c) => `  print(1)\n  ${c}\n`),
  ...CLOSERS.map((c) => `  t.a = f(1 2)\n  ${c}\n`),
];

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
