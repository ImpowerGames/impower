// The store and local list readers' follow-ups (I-1452), each form reporting
// the official parser's errors once, in Luau's words at Luau's ranges: a
// story local with a second value and no comma before it (I-1424), a bare
// local with no name (I-1425), a store name list with an empty slot before
// its end (I-1426), and a story store whose run-on value leaves a call open
// to the end of its line (I-1477). A store reports what the declaration
// spelled with `local`, as wide as `store`, does.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const SCENE = "scene start\n  Hello.\nend\n";

/** Syntax errors (with `all`, every error), as `start-end message` in 0-based lines and characters, sorted. */
function errorsOf(diagnostics: readonly SparkDiagnostic[], all = false): string[] {
  return diagnostics
    .filter((d) => d.severity === DiagnosticSeverity.Error && (all || !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d)))))
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

/** A cold compile's syntax errors. */
function sparkdownErrors(text: string): string[] {
  return compileErrors(newCompiler(text));
}

// A function ahead of the form, whose `0` an edit makes longer: the edit is
// away from the form, on a line before it, and changes no line count.
const PADDING = "function padding()\n  local p = 0\nend\n";

/** Asserts that an edit in `PADDING` ahead of `text` reports what a cold compile of the edited text does. */
function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  const offset = padded.indexOf("0");
  const compiler = newCompiler(padded);
  compiler.compile({ textDocument: { uri: URI } } as never);
  compiler.updateDocument({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [{ range: { start: { line: 1, character: 12 }, end: { line: 1, character: 13 } }, text: "10000000000" }],
  } as never);
  const edited = padded.slice(0, offset) + "10000000000" + padded.slice(offset + 1);
  expect(compileErrors(compiler)).toEqual(sparkdownErrors(edited));
}

/**
 * The official parser's errors for a line, moved down by `line` lines and
 * right by `shift` characters, with the bracket positions their messages
 * name (`at column 6`, `at line 2`) moved too.
 */
function official(text: string, line = 0, shift = 0): string[] {
  return officialErrorList(text)
    .map((error) =>
      error
        // A position on a later line than the text's first is not moved right.
        .replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + line}:${+sc + (+sl === 0 ? shift : 0)}-${+el + line}:${+ec + (+el === 0 ? shift : 0)}`)
        .replace(/at column (\d+)\)/, (_, column) => `at column ${+column + shift})`)
        .replace(/at line (\d+)\)/, (_, at) => `at line ${+at + line})`),
    )
    .sort();
}

/** Pins a line's errors before a scene, ending the document, with no line break after it and in a scene, cold and incremental. */
function pinLine(line: string, luau: string): void {
  const expected = official(`${luau}\n`);
  test(`${JSON.stringify(line)} before a scene`, () => {
    expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
    expect(sparkdownErrors(`${line}\n${SCENE}`)).toEqual(expected);
    expectIncrementalEqualsCold(`${line}\n${SCENE}`);
  });
  test(`${JSON.stringify(line)} ending the document`, () => {
    expect(sparkdownErrors(`${line}\n`)).toEqual(expected);
    expectIncrementalEqualsCold(`${line}\n`);
  });
  test(`${JSON.stringify(line)} with no line break after it`, () => {
    expect(sparkdownErrors(line)).toEqual(official(luau));
  });
  test(`${JSON.stringify(line)} in a scene`, () => {
    const text = `scene start\n  ${line}\n  Hello.\nend\n`;
    expect(sparkdownErrors(text)).toEqual(official(`${luau}\n`, 1, 2));
    expectIncrementalEqualsCold(text);
  });
}

describe("a story local with a second value and no comma before it (I-1424)", () => {
  for (const line of ["local a = 1 2", "local a, b = 1 2", "local a = {1, 2} 3", "local a = 1 Hello"]) pinLine(line, line);
});

describe("a bare local with no name (I-1425)", () => {
  for (const line of ["local", "local -- note"]) pinLine(line, line);
});

describe("a store name list with an empty slot before its end (I-1426)", () => {
  for (const line of ["store , = 1", "store a,, = 1", "store ,, = 1", "store , a = 1"]) pinLine(line, line.replace(/^store/, "local"));
});

// An error of another kind on a declaration's line, a name declared twice,
// reports something else and leaves the declaration's own (round 1).
describe("a declaration whose line holds another kind of error", () => {
  const lines = ["store , = 1", "store a,, = 1", "local a = 1 2", "local b = 1 Hello", "local", "store s = 1 g(x"];
  const text = `${lines.join("\n")}\n`;
  test("each line reports its own Luau errors", () => {
    const expected = lines.flatMap((line, i) => official(`${line.replace(/^store/, "local")}\n`, i)).sort();
    expect(sparkdownErrors(text)).toEqual(expected);
    expectIncrementalEqualsCold(text);
  });
  test("the names declared twice are reported", () => {
    const errors = errorsOf(newCompiler(text).compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [], true);
    expect(errors.some((e) => e.includes("Duplicate identifier `a`")), "a store and a local named `a`").toBe(true);
  });
});

describe("a story store whose run-on value leaves a call open to its line's end (I-1477)", () => {
  for (const line of ["store s = 1 g(x", "store s = 1 g(", "store s = 1 g(x, y", "store s = 1 g(x -- note", "local s = 1 g(x"]) {
    pinLine(line, line.replace(/^store/, "local"));
  }
});
