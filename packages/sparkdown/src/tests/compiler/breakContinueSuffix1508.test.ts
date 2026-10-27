// A written function whose loop holds a `break` or `continue` followed by
// tokens on its line ends that loop's block where Luau's parser ends it, as
// at a `return` (I-1430): the first following token gets the error for the
// block's missing closer, and the closers after it follow Luau's block
// stack, every error Luau reports reported once in Luau's words at Luau's
// range (I-1508).
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

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

const SUFFIXES = ["break x", "break x y", "break x y z", "break 1 x", "continue x", "continue x y", "continue x y z"];

// Each script's Luau is all of its lines but the story line after it. A form
// that declares a local sits in a function `o`, where a `local` may be
// written.
const FORMS: [string, (line: string) => string][] = [
  ["a while loop", (line) => `function f()\nwhile true do\n${line}\nend\nend\n`],
  ["a repeat loop", (line) => `function f()\nrepeat\n${line}\nuntil true\nend\n`],
  ["a numeric for loop", (line) => `function f()\nfor i = 1, 2 do\n${line}\nend\nend\n`],
  ["a generic for loop", (line) => `function f()\nfor k, v in pairs({}) do\n${line}\nend\nend\n`],
  ["an if in a loop", (line) => `function f()\nwhile true do\nif true then\n${line}\nend\nend\nend\n`],
  ["an if with else in a loop", (line) => `function f()\nwhile true do\nif true then\n${line}\nelse\nprint(1)\nend\nend\nend\n`],
  ["a do in a loop", (line) => `function f()\nwhile true do\ndo\n${line}\nend\nend\nend\n`],
  ["an if in a repeat", (line) => `function f()\nrepeat\nif true then\n${line}\nend\nuntil true\nend\n`],
  ["a loop before a later statement", (line) => `function f()\nwhile true do\n${line}\nend\nprint(1)\nend\n`],
  ["a loop before a later return", (line) => `function f()\nwhile true do\n${line}\nend\nreturn 2 a b\nend\n`],
  ["a local function", (line) => `function o()\nlocal function f()\nwhile true do\n${line}\nend\nend\nend\n`],
  ["a method", (line) => `function o()\nlocal t = {}\nfunction t:m()\nwhile true do\n${line}\nend\nend\nend\n`],
  ["a function value", (line) => `g = function()\nwhile true do\n${line}\nend\nend\n`],
];

describe("a loop's break or continue followed by tokens reports Luau's errors (I-1508)", () => {
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

  test("the ticket's reproduction", () => {
    const text = "function f()\nwhile true do\nbreak x y\nend\nend\n";
    const luau = [
      "2:6-2:7 Expected 'end' (to close 'do' at line 2), got 'x'",
      "2:8-2:9 Incomplete statement: expected assignment or a function call",
      "4:0-4:3 Expected <eof>, got 'end'",
    ];
    expect(officialErrorList(text).sort()).toEqual([...luau].sort());
    expect(sparkdownErrors(text)).toEqual([...luau].sort());
  });

  // A bare break or continue, and one closed on its own line, end nothing
  // early.
  for (const text of [
    "function f()\nwhile true do\nbreak\nend\nend\n",
    "function f()\nwhile true do\ncontinue\nend\nend\n",
    "function f()\nwhile true do\nbreak end\nend\n",
    "function f()\nwhile true do\nif true then break end\nend\nend\n",
  ]) {
    test(`${JSON.stringify(text)} is unchanged`, () => {
      expect(sparkdownErrors(`${text}Go.\n`)).toEqual(officialErrorList(text).sort());
    });
  }

  test("an incremental compile reports what a cold one does", () => {
    let text = "function f()\nwhile true do\nbreak\nend\nend\nGo {f()}.\n";
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
      [() => text.indexOf("break") + 5, 0, " x y"],
      [() => text.indexOf(" x y"), 4, ""],
      [() => text.indexOf("break"), 5, "continue x"],
      [() => text.indexOf("continue x") + 10, 0, " y"],
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
    expect(text).toContain("continue x y");
    expect(sparkdownErrors(text).some((e) => e.includes("Expected <eof>, got 'end'"))).toBe(true);
  });
});
