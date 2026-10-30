import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const SCENE = "scene start\n  Hello.\nend\n";

function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

function officialForStore(line: string): string[] {
  return officialErrorList(`${line.replace(/^store/, "local")}\n`).sort();
}

describe("a store reports every error Luau reports for the declaration (I-1370)", () => {
  const unreported = [
    "store t = {nil=1}",
    "store t = {1 2}",
    "store t = (1 +",
    "store = 1",
    "store a, = 1",
    "store t = {1, 2 3 4}",
    "store t = {x = 1 y = 2}",
    "store t = {[1] = 2, 3 4}",
    "store t = foo(",
    "store t = function() return {1 2} end",
    'store t = {1 "a"}',
    'store t = {"a" "b"}',
    'store t = {1, "a" "b"}',
  ];
  const reported = ["store t = {1 ? 2}", "store t = 1 +", "store t =", "store t: = 1", 'store t = "abc'];
  for (const line of [...unreported, ...reported]) {
    const official = officialForStore(line);
    test(`${JSON.stringify(line)} before a scene`, () => {
      expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`${line}\n${SCENE}`)).toEqual(official);
    });
    test(`${JSON.stringify(line)} ending the document`, () => {
      expect(sparkdownErrors(`${line}\n`)).toEqual(official);
    });
  }

  test("a store in a top-level block reports its errors", () => {
    expect(sparkdownErrors("if true then\n  store t = {1 2}\nend\nscene start\n  Hello.\nend\n")).toEqual([
      "1:15-1:16 Expected '}' (to close '{' at column 13), got '2'",
    ]);
  });

  test("a store in a function's body adds no error at its line's end", () => {
    expect(sparkdownErrors("function f(t)\n  store x = 1 +\n  local y = 2 +;\nend\n")).toEqual([
      "2:15-2:16 Expected identifier when parsing expression, got ';'",
      "2:2-2:7 Expected identifier when parsing expression, got 'local'",
    ]);
  });

  test.each([
    [`store hp = 100,\n${SCENE}`, ["0:14-0:15 Expected identifier when parsing expression, got <eof>"]],
    ["store x = if true then 1\nStory follows.\n", ["0:10-0:12 Expected 'else' when parsing if then else expression"]],
    ["store x =   \n", ["0:12-1:0 Expected identifier when parsing expression, got <eof>"]],
    ["store x: --[[ unfinished\nlocal y = 1", ["0:9-1:11 Expected identifier when parsing expression, got unfinished comment"]],
    ["store h = function() const a = 1; a = 2; return a end\nGo {h()}.\n", ["0:34-0:35 Variable 'a' is constant and may not be reassigned"]],
    [
      `store t = {1 ? 2}\n${SCENE}`,
      [
        "0:13-0:14 Expected '}' (to close '{' at column 11), got '?'",
        "0:15-0:16 Expected identifier when parsing expression, got '2'",
        "0:16-0:17 Expected identifier when parsing expression, got '}'",
      ],
    ],
  ])("%j keeps its report", (text, expected) => {
    expect(sparkdownErrors(text)).toEqual(expected);
  });

  test("an incremental compile reports what a cold one does", () => {
    let text = `store t = {1, 2}\nstore u = 1\n${SCENE}`;
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
    } as never);
    compiler.compile({ textDocument: { uri: URI } } as never);
    const positionAt = (offset: number) => {
      const lines = text.slice(0, offset).split("\n");
      return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
    };
    const steps: [string, string][] = [
      ["{1, 2}", "{1 2}"],
      ["store u = 1", "store u = 1,"],
      ["{1 2}", "{nil=1}"],
      ["store u = 1,", "store = 1"],
      ["{nil=1}", "{1, 2}"],
      ["store = 1", "store u = 1"],
    ];
    let version = 1;
    for (const [find, replace] of steps) {
      const offset = text.indexOf(find);
      expect(offset, `the text holds ${JSON.stringify(find)}`).toBeGreaterThanOrEqual(0);
      version += 1;
      compiler.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges: [{ range: { start: positionAt(offset), end: positionAt(offset + find.length) }, text: replace }],
      } as never);
      text = text.slice(0, offset) + replace + text.slice(offset + find.length);
      const incremental = (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
        .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
        .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
        .sort();
      expect(incremental, `after ${JSON.stringify(replace)}`).toEqual(sparkdownErrors(text));
    }
  });

  test("an operator with no operand ending the file is reported once", () => {
    expect(sparkdownErrors("store x = 1 +")).toEqual(["0:13-0:13 Expected identifier when parsing expression, got <eof>"]);
    expect(sparkdownErrors("store x = 1 +;\n")).toEqual(["0:13-0:14 Expected identifier when parsing expression, got ';'"]);
    expect(sparkdownErrors("store x = 1 +\nstore z = 2\n")).toEqual([
      "0:13-1:0 Expected identifier when parsing expression, got <eof>",
    ]);
  });

  test("a value list the tree ends before a token on its line is reported once", () => {
    expect(sparkdownErrors(`store a = 1, return\n${SCENE}`)).toEqual([
      "0:11-0:12 Expected identifier when parsing expression, got 'return'",
    ]);
  });

  test("a double-quoted string's interpolation is Sparkdown's", () => {
    expect(sparkdownErrors(`store s = "a {1 2} b"\n${SCENE}`)).toEqual([]);
    expect(sparkdownErrors(`store s = "a {x"\n${SCENE}`)).toEqual([
      "0:10-0:16 Malformed string; did you forget to finish it?",
      "0:13-0:16 Malformed interpolated string; did you forget to add a `}`?",
      "0:15-0:16 Malformed string; did you forget to finish it?",
    ]);
  });
  test("a divert target is Sparkdown's", () => {
    expect(sparkdownErrors(`store d = -> start\n${SCENE}`)).toEqual([]);
    expect(sparkdownErrors(`store t = {1, -> start}\n${SCENE}`)).toEqual([]);
  });
});
