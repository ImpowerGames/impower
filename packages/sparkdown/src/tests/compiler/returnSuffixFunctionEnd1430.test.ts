// A written function whose `return` is followed by two or more tokens on
// its line ends where Luau's parser ends it, at the error for its missing
// `end`, so the `end` that closes it in the text is met where Luau's
// chunk ends, and every error Luau reports is reported, once each, in
// Luau's words at Luau's range (I-1430, after I-1322 and I-1400).
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";
import { parseSource } from "./grammarSnapshot";
import { readLuauUnits } from "../../compiler/typecheck/readLuauAst";

const URI = "inmemory:///main.sd";

function errorsOf(compiler: SparkdownCompiler): string[] {
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

/** Sparkdown's syntax errors, as `start-end message` in 0-based lines and characters, in position order. */
function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return errorsOf(compiler);
}

const SUFFIXES = ["return 1 x y", "return 1 (x) y", "return x y z", "return 1 x y z"];

// Each script's Luau is all of its lines but the story line after it.
const FORMS: [string, (line: string) => string][] = [
  ["a function", (line) => `function f()\n${line}\nend\n`],
  ["a local function", (line) => `local function f()\n${line}\nend\n`],
  ["a method", (line) => `local t = {}\nfunction t:m()\n${line}\nend\n`],
  ["a nested block", (line) => `function f()\nif true then\n${line}\nend\nend\n`],
  ["a nested loop", (line) => `function f()\nwhile true do\n${line}\nend\nend\n`],
  // Closers Luau reads in a block they are not its own (an `else` in a
  // function's body, an `until` in a function's).
  ["a branch before an else", (line) => `function f()\nif true then\n${line}\nelse\nreturn 2\nend\nend\n`],
  ["a branch before an elseif", (line) => `function f()\nif true then\n${line}\nelseif false then\nreturn 2\nend\nend\n`],
  ["an else branch", (line) => `function f()\nif true then\nreturn 2\nelse\n${line}\nend\nend\n`],
  ["a repeat loop", (line) => `function f()\nrepeat\n${line}\nuntil true\nend\n`],
  ["a block in a loop", (line) => `function f()\nwhile true do\ndo\n${line}\nend\nend\nend\n`],
  ["a function value", (line) => `local g = function()\n${line}\nend\n`],
  ["a function value in a function", (line) => `function f()\nlocal g = function()\n${line}\nend\nreturn g\nend\n`],
  ["a function in a table", (line) => `local t = {function()\n${line}\nend}\n`],
  ["a function on one line", (line) => `function f() ${line} end\n`],
  ["a nested block before a later statement", (line) => `function f()\nif true then\n${line}\nend\nprint(1)\nend\n`],
  // A later return, which Luau reads in the block around the one it ended
  // (round 1 of the review).
  ["a function with a second return", (line) => `function f()\n${line}\nreturn 2 a b\nend\n`],
  ["a function with a second return of one token", (line) => `function f()\n${line}\nreturn 2 a\nend\n`],
  ["a function with a second bare return", (line) => `function f()\n${line}\nreturn\nend\n`],
  ["a nested block with a second return", (line) => `function f()\nif true then\n${line}\nreturn 2 a b\nend\nend\n`],
  ["a nested block before a second return", (line) => `function f()\nif true then\n${line}\nend\nreturn 2 a b\nend\n`],
  ["a repeat loop before a second return", (line) => `function f()\nrepeat\n${line}\nuntil true\nreturn 2 a b\nend\n`],
  ["a function with a second return before a later function", (line) => `function f()\n${line}\nreturn 2 a b\nend\nfunction g()\nreturn 3\nend\n`],
  // A block opened after the return, which Luau opens and reads as any
  // other (round 2 of the review).
  ["a function opened after the return", (line) => `function f()\n${line}\nlocal function g()\nreturn 2 a b\nend\nend\n`],
  ["a function value opened after the return", (line) => `function f()\n${line}\nlocal g = function()\nreturn 2 a b\nend\nend\n`],
  ["an if opened after the return", (line) => `function f()\n${line}\nif true then\nreturn 2 a b\nend\nend\n`],
  ["a do opened after the return", (line) => `function f()\n${line}\ndo\nreturn 2 a b\nend\nend\n`],
  ["a while opened after the return", (line) => `function f()\n${line}\nwhile true do\nreturn 2 a b\nend\nend\n`],
  ["a repeat opened after the return", (line) => `function f()\n${line}\nrepeat\nreturn 2 a b\nuntil true\nend\n`],
  ["a block opened after the return and closed", (line) => `function f()\n${line}\ndo\nlocal a = 1\nend\nend\n`],
  ["an if with else opened after the return", (line) => `function f()\n${line}\nif true then\nlocal a = 1\nelse\nreturn 2 a b\nend\nend\n`],
  ["a nested block's return before a block opened after it", (line) => `function f()\nif true then\n${line}\ndo\nreturn 2 a b\nend\nend\nend\n`],
  // Luau's words for the token where its chunk ends, and the block Luau's
  // suggestion names for a missing closer (round 3 of the review).
  ["a function with a later return of a string with interpolations", (line) => `function f()\n${line}\nreturn 2; \`a {x} z {y} w\`\nend\n`],
  ["a nested block in a repeat", (line) => `function f()\nrepeat\nif true then\n${line}\nend\nuntil true\nend\n`],
  ["an indented nested block in a repeat", (line) => `function f()\n  repeat\n    if true then\n      ${line}\n    end\n  until true\nend\n`],
  ["a misindented end after a nested block's return", (line) => `function f()\n  repeat\n    do\n      if true then\n        ${line}\n    end\n      end\n  until true\nend\n`],
  // Luau's recovery reading a wrong token and the closer after it, a
  // closer Luau took before the textual block's own, and the suggestion
  // at a later return (round 4 of the review).
  ["two shifts before a recovered until", (line) => `function f()\nrepeat\nrepeat\nif true then\n${line}\nreturn 2 a\nend\nuntil true\nuntil true\nend\n`],
  ["two shifts before a recovered end", (line) => `function f()\nwhile true do\nrepeat\nif true then\n${line}\nreturn 2 a\nuntil true\nend\nend\nend\n`],
  ["a later return after a shifted repeat", (line) => `function f()\nrepeat\nif true then\ndo\n${line}\nend\nuntil true\nreturn 2 a\nend\n`],
  ["a misindented end before a missing until", (line) => `function f()\n  while true do\n    repeat\n      if true then\n        ${line}\n    end\n  end\n  local a = 1\nend\n`],
];

// Scripts whose function is never closed, which end at their Luau: a line
// of story after it would be read as the function's.
const UNCLOSED: [string, (line: string) => string][] = [
  ["a function with no end", (line) => `function f()\n${line}\n`],
  ["a nested block with one end", (line) => `function f()\nif true then\n${line}\nend\n`],
  ["a nested block with no end", (line) => `function f()\nif true then\n${line}\n`],
  ["a repeat loop with no until", (line) => `function f()\nrepeat\n${line}\nend\n`],
  ["a function opened after the return with no end", (line) => `function f()\n${line}\nlocal function g()\nprint(1)\n`],
  ["a do opened after the return with no end", (line) => `function f()\n${line}\ndo\nprint(1)\n`],
  ["an if opened after the return with no end", (line) => `function f()\n${line}\nif true then\nprint(1)\n`],
  ["a repeat opened after the return with no until", (line) => `function f()\n${line}\nrepeat\nprint(1)\n`],
  ["a block opened after the return, closed, with no end", (line) => `function f()\n${line}\ndo\nprint(1)\nend\n`],
  ["an indented nested block before a later block", (line) => `function f()\n  while true do\n    if true then\n      ${line}\n      end\n  end\n  if true then\n    local a = 1\nend\n`],
  ["a nested function", (line) => `function f()\nlocal function g()\n${line}\nend\nreturn g\nend\n`],
];

describe("a function's return followed by two or more tokens reports Luau's errors (I-1430)", () => {
  for (const [name, form] of FORMS) {
    for (const line of SUFFIXES) {
      test(`${JSON.stringify(line)} in ${name}`, () => {
        const luau = form(line);
        const official = officialErrorList(luau).sort();
        expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(`${luau}Go.\n`)).toEqual(official);
      });
    }
  }
  for (const [name, form] of UNCLOSED) {
    for (const line of SUFFIXES) {
      test(`${JSON.stringify(line)} in ${name}`, () => {
        const luau = form(line);
        const official = officialErrorList(luau).sort();
        expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(luau)).toEqual(official);
      });
    }
  }

  // A define's method, which the lowerer reads alone (I-1368), stands for
  // the function `function f() … end` on its lines.
  for (const line of SUFFIXES) {
    test(`${JSON.stringify(line)} in a define's method`, () => {
      const official = officialErrorList(`\n  function f()\n    ${line}\n  end\n`).sort();
      expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`define X with\n  f()\n    ${line}\n  end\nend\n`)).toEqual(official);
    });
  }

  // Luau stops at the end of the chunk, but a later function of the
  // document is compiled on its own, and its errors are its own.
  test("a later function reports its own errors", () => {
    const first = "function f()\nreturn 1 x y\nend\n";
    const second = "function g()\nlocal t = {1 2}\nend\n";
    const shifted = officialErrorList(second).map((e) => e.replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + 3}:${sc}-${+el + 3}:${ec}`));
    expect(sparkdownErrors(`${first}${second}Go.\n`)).toEqual([...officialErrorList(first), ...shifted].sort());
  });

  // A repeat whose `end` Luau gives the function, so that Luau's chunk ends
  // at the `until` after it (round 4 of the review). The reading reports
  // Luau's list; a stray token after a top-level function is the grammar's
  // to report in a `.sd` document, so this pins the reading itself.
  for (const line of SUFFIXES) {
    test(`${JSON.stringify(line)} in a repeat whose end Luau gives the function`, () => {
      const luau = `function f()\nrepeat\n${line}\nend\nuntil true\nend\n`;
      const read = (readLuauUnits(parseSource(luau), luau).prelude?.errors ?? [])
        .filter((error) => !error.pastChunkEnd)
        .map((error) => `${error.location.begin.line}:${error.location.begin.column}-${error.location.end.line}:${error.location.end.column} ${error.message}`)
        .sort();
      expect(read).toEqual(officialErrorList(luau).sort());
    });
  }

  test("the ticket's reproduction", () => {
    const text = "function f()\nreturn 1 x y\nend\nGo {f()}.\n";
    const luau = [
      "1:9-1:10 Expected 'end' (to close 'function' at line 1), got 'x'",
      "1:11-1:12 Incomplete statement: expected assignment or a function call",
      "2:0-2:3 Expected <eof>, got 'end'",
    ];
    expect(officialErrorList(text).sort()).toEqual([...luau].sort());
    expect(sparkdownErrors(text)).toEqual([...luau].sort());
  });

  // One token after the return is Luau's lookahead recovery, which reads
  // the `end` after it (I-1400).
  test("one token after the return is unchanged", () => {
    const text = "function f()\nreturn 1 x\nend\n";
    expect(sparkdownErrors(`${text}Go.\n`)).toEqual(officialErrorList(text).sort());
  });

  test("an incremental compile reports what a cold one does", () => {
    let text = "function f()\nif true then\nreturn 1\nend\nend\nGo {f()}.\n";
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
    } as never);
    errorsOf(compiler);
    const positionAt = (offset: number) => {
      const lines = text.slice(0, offset).split("\n");
      return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
    };
    const steps: [() => number, number, string][] = [
      [() => text.indexOf("return 1") + 8, 0, " x y"],
      [() => text.indexOf(" x y"), 4, ""],
      [() => text.indexOf("return 1") + 8, 0, " (x) y"],
    ];
    let version = 1;
    for (const [at, removed, insert] of steps) {
      const offset = at();
      version += 1;
      compiler.updateDocument({
        textDocument: { uri: URI, version },
        contentChanges: [{ range: { start: positionAt(offset), end: positionAt(offset + removed) }, text: insert }],
      } as never);
      text = text.slice(0, offset) + insert + text.slice(offset + removed);
      expect(errorsOf(compiler), `after version ${version}`).toEqual(sparkdownErrors(text));
    }
    expect(text).toContain("return 1 (x) y");
    expect(sparkdownErrors(text).some((e) => e.includes("Expected <eof>, got 'end'"))).toBe(true);
  });
});
