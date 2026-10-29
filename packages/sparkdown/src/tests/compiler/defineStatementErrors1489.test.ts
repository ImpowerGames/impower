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

function errorsOf(compiler: SparkdownCompiler): string[] {
  return inPositionOrder(
    (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
      .filter((d) => d.severity === DiagnosticSeverity.Error)
      .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`),
  );
}

const errors = (text: string) => errorsOf(newCompiler(text));

const official = (body: string) => officialErrorList(`do\n${body}end\n`);

const define = (body: string) => `${HEADER}\n${body}end\n`;

function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

const PADDING = "function padding()\n  local p = 0\nend\n";

function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  const body = padded.indexOf("\n", PADDING.length) + 1;
  expect(body, "the body edits fall in the form").toBeGreaterThan(PADDING.length);
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

const BODIES: string[] = [
  "  t.f(1 +)\n",
  "  print(1 +)\n",
  "  t.f(1 +)\n  y = 2\n",
  "  t.f(1 2 3)\n  y = 2\n",
  "  print(1 2 3)\n",
  "  print(1 2 3)\n  y = 2\n",
  "  t.f(,)\n",
  "  print(,)\n",
  "  t.f(1 2 3)\n  print(4 5)\n",
  "  t.a = (1 +)\n",
  "  t.a = f(1 2 3)\n",
  "  t.a, t.b = 1 2\n",
  "  t.f(1 2\n",
  "  print(1 2\n",
  "  print(1 2 3\n",
  "  y = 2\n  t.f(1 2 3\n",
  "  print(1 +\n  t.a = 1\n",
  "  t.f(1 +\n  y = 2\n",
  "  Hello\n  Hi, Bob\n  1 + 2\n",
  "  t.a = 1 +\n  2\n",
  "  t.a = 1 +\n  print(2 +)\n",
  "  Hello there.\n",
  "  Hello\n  1 + 2\n",
  "  t.f(1); t.a, t.b\n  1 + 2\n",
  "  Hello Hi, Bob\n  1 + 2\n",
  "  t.a, t.b\n  1 + 2; t.f(1 +)\n",
  "  Hello\n  Hi, Bob\n  1 + 2; t.f(1 +)\n",
  "  t.a, t.b\n  1 + 2; Hello\n",
  "  t.f(1); t.a, t.b\n  f(\n    1 +)\n",
  "  t.a, t.b\n  1 + 2; there.\n",
  "  t.f(1); t.a, t.b\n  f(1); t.f(2 +)\n",
  "  t.f(1); t.a, t.b\n  f(1)\n  .g(2 +)\n",
  "  t.a, t.b\n  there.\n",
  "  t.a = 1 +\n  there.\n",
  "  there.\n",
  "  y = 1; there.\n",
  "  t.f(1)\n  there.\n",
  "  t.a = f(x., 1 2 3)\n",
  "  t.a, t.b\n  print(1); there.\n",
  "  there.\n  1 + 2; t.f(1 +)\n",
  "  t.f(1 2 3); there.\n  1 + 2; t.f(1 +)\n",
  "  y = 1; t.f(2 +)\n",
  "  y = 1; t.f(1 2 3)\n",
  "  t.f(1 +)\n  .g(2 +)\n",
  "  t.f(1 +)\n  :g(2 +)\n",
  "  t.f(1 +)\n  .g(2 +)\n  .h(3 +)\n",
  "  print(1 2)\n  .g(2 +)\n",
  "  t.a = if true then 1\n",
  "  t.a = t:do()\n",
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

  test("a call after a property after a dangling line reports its error once", () => {
    const body = "  t.a, t.b\n  there.\n  y = 1; t.f(2 +)\n";
    const text = define(body);
    const reported = errors(text);
    for (const error of official(body).filter((e) => !e.startsWith("3:4-"))) {
      expect(reported.filter((e) => e === error), error).toHaveLength(1);
    }
    expectIncrementalEqualsCold(text);
  });

  const BROKEN_BODY = "  t.f(1 +)\n  print(1 2 3)\n  t.a = f(x., 1)\n";
  const BROKEN: [form: string, text: string, header: string][] = [
    ["no name", `define\n${BROKEN_BODY}end\n`, "This define has no name"],
    ["an unreadable name", `define 2hero with\n${BROKEN_BODY}end\n`, "`2` cannot be a define name"],
    ["an unreadable header", `define X with )\n${BROKEN_BODY}end\n`, "This define cannot be read past"],
    ["a missing end", `define X with\n${BROKEN_BODY}`, "Define is missing its closing `end` keyword"],
    ["a body without with", `define X\n${BROKEN_BODY}end\n`, "This define has a body, so its header line needs `with`"],
  ];
  for (const [form, text, header] of BROKEN) {
    test(`a define with ${form} reads its body`, () => {
      const reported = errors(text);
      expect(reported.filter((e) => e.includes(header)), reported.join("\n")).toHaveLength(1);
      expect(reported.filter((e) => !e.startsWith("0:") && !e.includes(header))).toEqual(official(BROKEN_BODY));
      expectIncrementalEqualsCold(text);
    });
  }

  test("a define with a statement on its header line reads its body", () => {
    const text = `define X with t.f(1 +)\n${BROKEN_BODY}end\n`;
    const reported = errors(text);
    expect(reported.filter((e) => e.includes("after `with` in the define header")), reported.join("\n")).toHaveLength(1);
    expect(reported.filter((e) => e.startsWith("0:") && e.includes("got ')'"))).toEqual([
      "0:21-0:22 Expected identifier when parsing expression, got ')'",
    ]);
    expect(reported.filter((e) => !e.startsWith("0:"))).toEqual(official(BROKEN_BODY));
    expectIncrementalEqualsCold(text);
  });

  const HEADER_RUNS_ON: [text: string, error: string][] = [
    ["define 2hero.\n  t.f(1 +)\nend\n", "1:9-1:10 Expected identifier when parsing expression, got ')'"],
    ["define 2hero.\n  1 + 2; t.f(1 +)\nend\n", "1:16-1:17 Expected identifier when parsing expression, got ')'"],
    ["define X with t.a = 1 +\n  1 + 2; t.f(1 +)\nend\n", "1:16-1:17 Expected identifier when parsing expression, got ')'"],
  ];
  HEADER_RUNS_ON.push(
    ["define X with there.\n  y = 1; t.f(1 +)\nend\n", "1:16-1:17 Expected identifier when parsing expression, got ')'"],
    ["define 2hero.\n  y = 1; t.f(1 +)\nend\n", "1:16-1:17 Expected identifier when parsing expression, got ')'"],
  );
  for (const [text, error] of HEADER_RUNS_ON) {
    test(`a body line after a header that runs on reports once: ${JSON.stringify(text)}`, () => {
      expect(errors(text).filter((e) => e === error)).toEqual([error]);
      const body = text.split("\n").slice(1, -2).join("\n") + "\n";
      expect(official(body)).toContain(error);
      expectIncrementalEqualsCold(text);
    });
  }

  const BODY_AFTER_HEADER: [text: string, body: string][] = [
    ["define X with there.\n  t.f(1 2 3)\n  t.f(1 +)\nend\n", "  t.f(1 2 3)\n  t.f(1 +)\n"],
    ["define 2hero.\n  t.f(1 2 3)\nend\n", "  t.f(1 2 3)\n"],
    ["define X with\n  function()\n    t.a = f(x., 1)\n  end\nend\n", "  function()\n    t.a = f(x., 1)\n  end\n"],
    ["define X with\n  function()\n    x.\n  end\nend\n", "  function()\n    x.\n  end\n"],
  ];
  for (const [text, body] of BODY_AFTER_HEADER) {
    test(`the body reports the official errors: ${JSON.stringify(text)}`, () => {
      expect(errors(text).filter((e) => !e.startsWith("0:") && !/^1:\d+-\d+:\d+ .*(?:define|header)/.test(e))).toEqual(official(body));
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
