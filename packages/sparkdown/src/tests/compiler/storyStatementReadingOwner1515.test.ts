// A story statement's Luau reading is the one owner of its syntax errors
// (I-1515): every error Luau's parser reports is reported once, in Luau's
// words at Luau's range, with no filter, as I-1322 does for a function's
// own Luau and I-1435 for a backtick string's. A story `if` whose condition
// holds two juxtaposed values (I-1472), a story `local` with two errors at
// one token (I-1492), a top-level call whose argument is a function with a
// return suffix (I-1509) and a stray closer after a top-level function
// (I-1514), with their neighbours.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

/** Syntax errors, as `start-end message` in 0-based lines and characters, sorted. */
function errorsOf(diagnostics: readonly SparkDiagnostic[]): string[] {
  return diagnostics
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
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

/**
 * The Luau of a script, line for line: a scene's header and its `end`, and
 * each line of story (`Hi.`), are blank, and a `&` mark is a space, so the
 * official parser reads the statements alone at the lines and columns they
 * stand on.
 */
function luauOf(text: string): string {
  const lines = text.split("\n");
  const sceneEnd = lines[0]?.startsWith("scene ") ? lines.lastIndexOf("end") : -1;
  return lines
    .map((line, i) =>
      (i === 0 && sceneEnd >= 0) || i === sceneEnd || /^\s*[A-Z][a-z]*\.$/.test(line) || /^\s*\/\//.test(line) ? "" : line.replace(/^(\s*)&/, "$1 "),
    )
    .join("\n");
}

/** The official parser's errors for a script's Luau (`luauOf`), sorted. */
function official(text: string): string[] {
  return officialErrorList(luauOf(text)).sort();
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

/** Asserts that a script reports the official parser's errors for its Luau, cold and incrementally. */
function expectOfficial(text: string): void {
  const expected = official(text);
  expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
  expect(sparkdownErrors(text)).toEqual(expected);
  expectIncrementalEqualsCold(text);
}

const CONDITIONS = ["(1 2)", "1 2", "(1 2) == 3", "x (1 2)"];
// A loop's header whose `)` Luau's recovery misses (`while (1 2) do`)
// leaves the loop open in Luau's reading, which names its opener by the
// token it recovered at (`to close number`); the reading names it by its
// text and, in a scene, as the flow's function's, so those are left out.
const LOOP_CONDITIONS = ["1 2", "x (1 2)"];

// Story statements whose condition the reading reads, in a scene and at the
// top level of the script.
const CONDITION_FORMS: [string, (condition: string) => string, string[]][] = [
  ["an if", (c) => `  if ${c} then\n    Hi.\n  end\n`, CONDITIONS],
  ["an elseif", (c) => `  if true then\n    Hi.\n  elseif ${c} then\n    Ho.\n  end\n`, CONDITIONS],
  ["a while", (c) => `  while ${c} do\n    Hi.\n  end\n`, LOOP_CONDITIONS],
  ["a numeric for", (c) => `  for i = ${c}, 3 do\n    Hi.\n  end\n`, LOOP_CONDITIONS],
  ["a generic for", (c) => `  for k, v in ${c} do\n    Hi.\n  end\n`, LOOP_CONDITIONS],
  ["a repeat", (c) => `  repeat\n    Hi.\n  until ${c}\n`, CONDITIONS],
];

describe("a story statement's reading reports Luau's errors once (I-1515)", () => {
  test("I-1472's reproduction", () => {
    const text = "scene start\n  if (1 2) then\n    Hi.\n  end\nend\n";
    const luau = [
      "1:8-1:9 Expected ')' (to close '(' at column 6), got '2'",
      "1:9-1:10 Expected identifier when parsing expression, got ')'",
      "1:11-1:15 Expected identifier when parsing expression, got 'then'",
    ];
    expect(official(text)).toEqual([...luau].sort());
    expect(sparkdownErrors(text)).toEqual([...luau].sort());
  });

  for (const [name, form] of CONDITION_FORMS) {
    const valid = name.includes("numeric") ? "1" : name.includes("generic") ? "pairs({})" : "1 == 1";
    test(`a well-formed ${name.slice(name.indexOf(" ") + 1)} reports nothing`, () => {
      const text = `scene start\n${form(valid)}end\n`;
      expect(official(text)).toEqual([]);
      expect(sparkdownErrors(text)).toEqual([]);
      expect(sparkdownErrors(form(valid).replace(/^ {2}/gm, ""))).toEqual([]);
    });
  }

  for (const [name, form, conditions] of CONDITION_FORMS) {
    for (const condition of conditions) {
      test(`${JSON.stringify(condition)} in ${name} in a scene`, () => {
        expectOfficial(`scene start\n${form(condition)}end\n`);
      });
      test(`${JSON.stringify(condition)} in ${name} at the top level`, () => {
        expectOfficial(form(condition).replace(/^ {2}/gm, ""));
      });
    }
  }

  const DECLARATIONS = ["{1 ? 2}, {3 ? 4}", "{1 ? 2}, {3 ? 4} 5", "{1 ? 2}", "(1 ? 2)", "f(1 ? 2)"];

  test("I-1492's reproduction", () => {
    const text = "scene start\n  local a = {1 ? 2}, {3 ? 4}\n  Hi.\nend\n";
    const errors = sparkdownErrors(text);
    expect(errors).toContain("1:24-1:25 Expected '=' when parsing assignment, got '?'");
    expect(errors).toContain("1:24-1:25 Expected '}' (to close '{' at column 22), got '?'");
    expect(errors).toEqual(official(text));
  });

  // A `store` at the top level, whose value Luau reads as a `local`'s, and a
  // `local` in a scene.
  for (const value of DECLARATIONS) {
    test(`a store of ${JSON.stringify(value)} at the top level`, () => {
      const text = `store a = ${value}\n`;
      const expected = official(`local a = ${value}\n`);
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
    test(`a local of ${JSON.stringify(value)} in a scene`, () => {
      const text = `scene start\n  local a = ${value}\n  Hi.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(official(text));
      expectIncrementalEqualsCold(text);
    });
  }

  // A line that begins with a call is a line of story in a `.sd` script; a
  // call is Luau on a `&` line or as a value.
  const CALLS = [
    "& print(function() return 1 x y end)\nGo.\n",
    "& print(function() return 1 x end)\nGo.\n",
    "& print(1, function() return x y z end)\nGo.\n",
    "& f(function() return 1 x y end, 2)\nGo.\n",
    "x = print(function() return 1 x y end)\nGo.\n",
    "scene start\n  local g = print(function() return 1 x y end)\n  Go.\nend\n",
    "scene start\n  local g = print(function()\n  return 1 x y\n  end)\n  Go.\nend\n",
    "scene start\n  & print(function() return 1 x y end)\n  Go.\nend\n",
  ];

  test("I-1509's reproduction, written as Luau", () => {
    expect(sparkdownErrors(CALLS[0]!)).toEqual([
      "0:28-0:29 Expected 'end' (to close 'function' at column 9), got 'x'",
      "0:30-0:31 Incomplete statement: expected assignment or a function call",
      "0:32-0:35 Expected <eof>, got 'end'",
    ]);
  });

  for (const text of CALLS) {
    test(`a call ${JSON.stringify(text)}`, () => {
      expectOfficial(text);
    });
  }

  const STRAY = [
    "function f()\nend\nuntil true\nend\nGo.\n",
    "function f()\nend\nuntil true\n// note\nend\nGo.\n",
    "function f()\nend\nend\nGo.\n",
    "function f()\nend\nend\nend\nGo.\n",
    "function f()\nend\nuntil true\nGo.\n",
    "function f()\nrepeat\nreturn 1 x y\nend\nuntil true\nend\nGo.\n",
  ];

  // A story block's missing closer is Sparkdown's block checks' to name
  // (I-1322), and the reading, whose input ends with the block's Luau, does
  // not name it again.
  for (const text of [
    "if true then\n  Hi.\n",
    "while true do\n  Hi.\n",
    "repeat\n  Hi.\n",
    "scene start\n  if true then\n    Hi.\n  Ho.\n",
    "repeat\n  if true then\n    Hi.\nuntil true\n",
  ]) {
    test(`a story block's missing closer is reported once ${JSON.stringify(text)}`, () => {
      const errors = sparkdownErrors(text);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/is missing its closing/);
    });
  }

  test("I-1514's reproduction", () => {
    expect(sparkdownErrors(STRAY[0]!)).toEqual(["2:0-2:5 Expected <eof>, got 'until'"]);
  });

  for (const text of STRAY) {
    test(`a stray closer ${JSON.stringify(text)}`, () => {
      expectOfficial(text);
    });
  }
});
