// A story store or local whose own value leaves a bracket open to the end of
// its line names the opener as Luau does, by line (I-1490): Luau's end of
// input stands on the next line, so its message says `at line N`, not
// `at column N`, at the range it already reported.
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

/**
 * Pins a line's errors before a scene, ending the document and with no line
 * break after it, cold and incremental. In a scene, a story line after the
 * open bracket is read on into, which is no wording of the opener's.
 */
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
}

describe("a story store or local whose value leaves a bracket open to its line's end (I-1490)", () => {
  for (const value of ["g(x", "{1", "(1", "g(x, y", "{1, 2"]) {
    pinLine(`store s = ${value}`, `local s = ${value}`);
    pinLine(`local s = ${value}`, `local s = ${value}`);
  }
  pinLine("local s = (1 -- note", "local s = (1 -- note");
});

// A bracket closed on a later line keeps its current wording.
describe("a store whose bracket closes on a later line (I-1490)", () => {
  for (const text of ["store s = g(\n  x)\n", "store s = {1,\n  2}\n"]) {
    test(JSON.stringify(text), () => {
      expect(sparkdownErrors(`${text}${SCENE}`)).toEqual(officialErrorList(text.replace(/^store/, "local")).sort());
    });
  }
});
