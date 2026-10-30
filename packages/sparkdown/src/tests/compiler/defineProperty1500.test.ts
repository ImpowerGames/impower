import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { inPositionOrder, officialErrorList } from "./officialSyntax";
import { messageOf } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
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

const errors = (text: string) => errorsOf(newCompiler(text));

const official = (body: string) => officialErrorList(`do\n${body}end\n`);

const define = (body: string) => `define X with\n${body}end\nscene start\nend\n`;

function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

const PADDING = "function padding()\n  local p = 0\nend\n";

function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  const body = padded.indexOf("\n", PADDING.length) + 1;
  for (const [offset, removed, insert] of [
    [padded.indexOf("0"), 1, "10000000000"],
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

const BODIES: string[] = [
  "  y = print(1 2 3)\n",
  "  y = print(1 2 3)\n  z = 2\n",
  "  y = (1 +)\n",
  "  y = print(1 +)\n  z = 2\n",
  "  y = print(1, 2\n",
  "  y = {1, 2\n",
  "  y = print(1,\n    2 3)\n",
  "  y = 1 +\n    print(2 3)\n",
  "  y = `a {1 2}`\n",
  "  y = print(`a {1 2}`, 3 4)\n",
  "  y = print(x., 1 2)\n",
];

describe("a define body property reports every Luau error of its value once (I-1500)", () => {
  for (const body of BODIES) {
    test(JSON.stringify(body), () => {
      const text = define(body);
      expect(official(body), "the value has errors").not.toEqual([]);
      expect(errors(text)).toEqual(official(body));
      expectIncrementalEqualsCold(text);
    });
  }

  test("a property followed by a call on its line reports its value's error once", () => {
    const body = "  y = print(1 2); print(3 4)\n";
    const text = define(body);
    const [error] = official(body);
    expect(error).toBe("1:14-1:15 Expected ')' (to close '(' at column 12), got '2'");
    expect(errors(text).filter((e) => e === error)).toEqual([error]);
    expectIncrementalEqualsCold(text);
  });

  const BROKEN_BODY = "  y = print(1 2 3)\n  z = (1 +)\n";
  const BROKEN: [form: string, text: string, header: string][] = [
    ["no name", `define\n${BROKEN_BODY}end\n`, "This define has no name"],
    ["an unreadable name", `define 2hero with\n${BROKEN_BODY}end\n`, "`2` cannot be a define name"],
    ["a missing end", `define X with\n${BROKEN_BODY}`, "Define is missing its closing `end` keyword"],
    ["a body without with", `define X\n${BROKEN_BODY}end\n`, "This define has a body, so its header line needs `with`"],
  ];
  for (const [form, text, header] of BROKEN) {
    test(`a define with ${form} reports its properties' errors`, () => {
      const reported = errors(text);
      expect(reported.filter((e) => e.includes(header)), reported.join("\n")).toHaveLength(1);
      expect(reported.filter((e) => !e.startsWith("0:") && !e.includes(header))).toEqual(official(BROKEN_BODY));
      expectIncrementalEqualsCold(text);
    });
  }

  test("a property Luau reads reports nothing", () => {
    for (const body of ["  y = print(1, 2)\n", "  y = 1 +\n    2\n", "  y = `a {x}`\n"]) {
      expect(official(body), body).toEqual([]);
      expect(errors(define(body)), body).toEqual([]);
    }
  });
});
