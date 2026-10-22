// In story braces, dialogue, choice text, a choice's condition and an
// alternator's head and arms, the lowerer's reading of the expression is the
// one owner of its syntax errors, in Luau's words (I-1445): Sparkdown's tree
// checks defer to it, and it names the token it ends at, the brace's `}` or
// the arm's `|`, as Luau's reading of the same expression before that token
// does. A choice's condition reports its reading's errors (I-1461), and a
// story `if` whose condition holds a backtick string Luau gives up on
// reports Luau's `Expected 'then'` at the token it stopped on (I-1463). Each
// form reports what a cold compile of the same text reports after an edit
// away from it.
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

/** The official parser's errors for `text`, moved down by `line` lines and right by `shift` characters. */
function official(text: string, line = 0, shift = 0): string[] {
  return officialErrorList(text)
    .map((error) =>
      error.replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + line}:${+sc + shift}-${+el + line}:${+ec + shift}`),
    )
    .sort();
}

/** The position of `offset` in `text`, as an LSP position. */
function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

// A function ahead of the form, whose `0` an edit makes longer: the edit is
// away from the form, on a line before it, and changes no line count.
const PADDING = "function padding()\n  local p = 0\nend\n";

/** Asserts that an edit in `PADDING` ahead of `text` reports what a cold compile of the edited text does. */
function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  for (const [offset, removed, insert] of [
    [padded.indexOf("0"), 1, "10000000000"],
    [padded.indexOf("local p"), 0, "                                    "],
  ] as const) {
    const compiler = newCompiler(padded);
    compiler.compile({ textDocument: { uri: URI } } as never);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: positionAt(padded, offset), end: positionAt(padded, offset + removed) }, text: insert }],
    } as never);
    const edited = padded.slice(0, offset) + insert + padded.slice(offset + removed);
    expect(compileErrors(compiler), `after ${JSON.stringify(insert)}`).toEqual(sparkdownErrors(edited));
  }
}

/**
 * A place an expression `E` stands in: the script with `E` in it, and where
 * `E` begins (`line`, `column`). The oracle is Luau's reading of a table
 * that holds `E` at the same columns (`_ = {E}`), whose `}` stands where the
 * place's end token does: the brace's `}`, or, a space after `E`, an arm's
 * `|`, which the place's errors name instead (`end`).
 */
interface Place {
  name: string;
  wrap: (expr: string) => string;
  line: number;
  column: number;
  end: "}" | "|";
}

const STORY: Place = { name: "story text", wrap: (e) => `scene start\n  Hello {${e}}.\nend\n`, line: 1, column: 9, end: "}" };
const DIALOGUE: Place = { name: "dialogue", wrap: (e) => `scene start\n  @ BOB\n  Hi {${e}}.\nend\n`, line: 2, column: 6, end: "}" };
const CHOICE: Place = { name: "choice text", wrap: (e) => `scene start\n  choose\n    * Go {${e}}.\n      Hi.\n  end\nend\n`, line: 2, column: 10, end: "}" };
const ARM: Place = { name: "a store's arm", wrap: (e) => `store s = cycle | ${e} | 3 end\n`, line: 0, column: 18, end: "|" };
const BRACE_ARM: Place = { name: "a story brace's arm", wrap: (e) => `scene start\n  Hello {cycle | ${e} | 3 end}.\nend\n`, line: 1, column: 17, end: "|" };
const MATCH_HEAD: Place = { name: "a story brace's match condition", wrap: (e) => `scene start\n  Hello {match ${e} | 1 = 2 end}.\nend\n`, line: 1, column: 15, end: "|" };

/**
 * Luau's errors for `expr` at `place`, in the words a lone expression's
 * reading gives them: the table's `Expected '}' (to close '{' ...)`, where
 * Luau finds the expression ended before the token, is the reading's
 * `Expected the end of the expression`, and an arm's `|` stands for the `}`.
 */
function oracle(place: Place, expr: string): string[] {
  const brace = place.column - 1;
  const text = `${"\n".repeat(place.line)}_ =${" ".repeat(brace - 3)}{${expr}${place.end === "|" ? " " : ""}}\n`;
  return official(text).map((error) => {
    let mapped = error.replace(new RegExp(`Expected '\\}' \\(to close '\\{' at column ${brace + 1}\\), got`), "Expected the end of the expression, got");
    if (place.end === "|") mapped = mapped.replace(/got '\}'$/, "got '|'");
    return mapped;
  });
}

/**
 * Asserts that the reading reports Luau's errors for the form: something
 * exactly where Luau reports something, each error once, Luau's first error,
 * and nothing Luau does not report (the reading stops at the end of the
 * expression, where Luau's reading of the table goes on in its recovery).
 */
function expectLuauErrors(place: Place, expr: string): void {
  const text = place.wrap(expr);
  const errors = sparkdownErrors(text);
  const expected = oracle(place, expr);
  expect(errors.length > 0, `${JSON.stringify(errors)} against Luau's ${JSON.stringify(expected)}`).toBe(expected.length > 0);
  // Each error once: not by two readers, nor twice by one.
  expect(errors, "no error reported twice").toEqual([...new Set(errors)]);
  for (const error of errors) expect(expected, "an error Luau reports").toContain(error);
  if (expected.length > 0) {
    const [first] = officialErrorList(`${"\n".repeat(place.line)}_ =${" ".repeat(place.column - 4)}{${expr}${place.end === "|" ? " " : ""}}\n`);
    const firstMessage = first!.slice(first!.indexOf(" ") + 1);
    expect(
      errors.some((error) => error.endsWith(firstMessage.replace(/got '\}'$/, `got '${place.end}'`)) || /Expected the end of the expression/.test(error)),
      `Luau's first error, ${first}`,
    ).toBe(true);
  }
  expectIncrementalEqualsCold(text);
}

// Forms within one value: a bracket, call or index left open or holding two
// values, a name or value missing after `.`, `:`, an operator or `not`, a
// type missing after `::`, a method call without arguments, and an if
// expression with a part in error or missing.
const VALUE_FORMS = [
  "(1",
  "(1 2)",
  "f(",
  "f(1",
  "f(1,",
  "f(1 2)",
  "x.",
  "a.b.c.",
  "(x.)",
  "f(x.)",
  "t.(",
  "x +",
  "x ..",
  "x and",
  "not",
  "-",
  "#",
  "x:m",
  "x[",
  "x[1",
  "x[1 2]",
  "t[]",
  "(",
  "()",
  "(if true then 1 else 2",
  "(if true then 1)",
  "(if true then 1 else (2 3))",
  "(if (1 2) then 1 else 2)",
];

// Forms Luau ends the expression before: two values side by side, which an
// arm reads as two values of its sequence.
const SIDE_BY_SIDE = ["1 2", "x y", "(if true then 1 else 2) 3", "1 `a {} b`"];

// Forms that are one value in a brace, but that the grammar reads apart in
// an arm: a trailing `==`, `:` or `::` takes the arm's `|` (I-1476), and an
// arm's `if` begins an if statement (I-1465).
const BRACE_ONLY = ["x ==", "x:", "x::", "if true", "if then 1 else 2", "if true then else 2", "if true then 1 else (2 3)", "if (1 2) then 1 else 2"];

describe("story braces, dialogue and choice text: the reading reports Luau's errors", () => {
  for (const place of [STORY, DIALOGUE, CHOICE]) {
    for (const expr of [...VALUE_FORMS, ...SIDE_BY_SIDE, ...BRACE_ONLY]) {
      // Choice text reads a `[` as its own bracket, the text a choice shows
      // only before it is chosen.
      if (place === CHOICE && expr.includes("[")) continue;
      test(`${place.name}: {${expr}}`, () => expectLuauErrors(place, expr));
    }
  }
});

describe("an alternator's head and arms: the reading reports Luau's errors, naming the `|`", () => {
  for (const place of [ARM, BRACE_ARM]) {
    for (const expr of VALUE_FORMS) {
      test(`${place.name}: | ${expr} |`, () => expectLuauErrors(place, expr));
    }
    // Two values side by side are two values of the arm's sequence.
    for (const expr of SIDE_BY_SIDE.slice(0, 3)) {
      test(`${place.name}: | ${expr} | is a sequence`, () => {
        const text = place.wrap(expr);
        expect(sparkdownErrors(text)).toEqual([]);
        expectIncrementalEqualsCold(text);
      });
    }
  }
  // A match's condition the grammar reads to its `|` (not one that ends
  // with an open bracket or call, which the grammar reads past it).
  for (const expr of ["x.", "x +", "x and", "(1 2)", "f(1 2)", "x[1 2]", "t[]", "()", "x:m", "(x.)", "a.b.c.", "x =="]) {
    test(`${MATCH_HEAD.name}: match ${expr} |`, () => expectLuauErrors(MATCH_HEAD, expr));
  }
});

// The forms the I-1435 split left to nobody or to the tree checks' words,
// pinned to the message each now reports (re-baselined from
// `backtickStringOwner1435.test.ts`).
describe("the reading's words, at the token it ends at", () => {
  const forms: [string, string[]][] = [
    ["f(", ["1:11-1:12 Expected identifier when parsing expression, got '}'"]],
    ["(1", ["1:11-1:12 Expected ')' (to close '(' at column 10), got '}'"]],
    ["x.", ["1:11-1:12 Expected identifier, got '}'"]],
    ["x:", ["1:11-1:12 Expected identifier when parsing method name, got '}'", "1:9-1:11 Expected '(', '{' or <string> when parsing function call, got '}'"]],
    ["x::", ["1:12-1:13 Expected type, got '}'"]],
    ["(if true then 1 else 2) 3", ["1:33-1:34 Expected the end of the expression, got '3'"]],
    ["(if true then 1 else 2", ["1:31-1:32 Expected ')' (to close '(' at column 10), got '}'"]],
    ["if true then 1 else (2 3)", ["1:32-1:33 Expected ')' (to close '(' at column 30), got '3'"]],
    ["if true", ["1:16-1:17 Expected 'then' when parsing if then else expression, got '}'"]],
  ];
  for (const [expr, expected] of forms) {
    test(`Hello {${expr}}.`, () => {
      const text = `scene start\n  Hello {${expr}}.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
  }
});

// A brace with no `}` reads its content to the end, past its line: the
// reading reports what the content lacks there, once, and the brace's own
// error says the `}` is missing. A clause-less if expression and one with no
// value report Luau's words at the `}`.
describe("a brace the reading reads to its end", () => {
  const forms: [string, string[]][] = [
    [
      "scene start\n  Hello {x.\n  After.\nend\n",
      [
        "1:10-1:11 Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line",
        "1:8-3:0 Malformed interpolated string; did you forget to add a `}`?",
        "2:8-3:0 Expected identifier, got <eof>",
      ],
    ],
    ["scene start\n  Hello {f(\n  After.\nend\n", ["1:8-3:0 Malformed interpolated string; did you forget to add a `}`?", "2:8-3:0 Expected identifier, got <eof>"]],
    ["scene start\n  Hello {if x}.\nend\n", ["1:13-1:14 Expected 'then' when parsing if then else expression, got '}'"]],
    ["scene start\n  Hello {if x then}.\nend\n", ["1:18-1:19 Expected identifier when parsing expression, got '}'"]],
  ];
  for (const [text, expected] of forms) {
    test(JSON.stringify(text.split("\n").slice(1, 3).join("\n")), () => {
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
  }
});

// A keyword the tree reads as a member's name reads a define's property of
// that name (#1081), in story text and an arm alike.
describe("a keyword member name is Sparkdown's", () => {
  for (const text of [
    "define cfg with\n  repeat = 3\nend\nValue {cfg.repeat}.\n",
    "define cfg with\n  repeat = 3\nend\nstore s = cycle | cfg.repeat | 3 end\n",
  ]) {
    test(JSON.stringify(text.split("\n")[3]), () => {
      expect(sparkdownErrors(text)).toEqual([]);
      expectIncrementalEqualsCold(text);
    });
  }
});

// Story text, dialogue and choice text may leave out an if expression's
// `else` where the brace holds it whole (`{if c then a}` shows nothing when
// `c` is false): the reading reports what the last value lacks at the `}`,
// and not the `else` Luau would expect there. A parenthesized if expression
// is Luau's, whose `else` it requires.
describe("a brace's if expression may leave out its else", () => {
  for (const place of [STORY, DIALOGUE, CHOICE]) {
    for (const expr of ["if true then 1", "if true then 1 elseif false then 2"]) {
      test(`${place.name}: {${expr}} reports nothing`, () => {
        const text = place.wrap(expr);
        expect(sparkdownErrors(text)).toEqual([]);
        expectIncrementalEqualsCold(text);
      });
    }
    test(`${place.name}: {if true then (1} reports the unclosed parenthesis`, () => {
      const text = place.wrap("if true then (1");
      const errors = sparkdownErrors(text);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/ Expected '\)' \(to close '\(' at column \d+\), got '\}'$/);
      expectIncrementalEqualsCold(text);
    });
    test(`${place.name}: {if true then x.} reports the missing name`, () => {
      const text = place.wrap("if true then x.");
      const errors = sparkdownErrors(text);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/ Expected identifier, got '\}'$/);
      expectIncrementalEqualsCold(text);
    });
  }
  test("story text: {(if true then 1)} reports the missing else", () => {
    const text = STORY.wrap("(if true then 1)");
    expect(sparkdownErrors(text)).toEqual(["1:24-1:25 Expected 'else' when parsing if then else expression, got ')'"]);
    expectIncrementalEqualsCold(text);
  });
});

// A choice's `if` condition reports its reading's errors (I-1461): Luau's
// first error for the condition, read alone, as Luau's reading of `if
// <condition> then` gives it.
describe("a choice's if condition reports its reading's errors", () => {
  for (const condition of ["(1 2)", "(x y)", "(x[1 2])", "(1 `a {} b`)"]) {
    test(`* if ${condition} Go`, () => {
      const text = `scene start\n  choose\n    * if ${condition} Go\n      Hi.\n  end\nend\n`;
      const errors = sparkdownErrors(text);
      const luau = official(`\n\n    * if ${condition} then end\n`.replace("* ", "  "));
      expect(errors).toHaveLength(1);
      expect(luau[0]).toBe(errors[0]);
      expectIncrementalEqualsCold(text);
    });
  }
});

// A story `if` whose condition holds a backtick string Luau gives up on
// reports every error Luau reports for the line, `Expected 'then'` at the
// token Luau stopped on included (I-1463).
describe("a story if whose condition's backtick string Luau gives up on", () => {
  for (const string of ["`a {1 2} b`", "`a\\x {y} b`"]) {
    test(`if ${string} == "x" then`, () => {
      const text = `scene start\n  if ${string} == "x" then\n    Hi.\n  end\nend\n`;
      const expected = official(`if ${string} == "x" then\nend\n`, 1, 2);
      expect(expected.some((error) => error.includes("Expected 'then' when parsing if statement"))).toBe(true);
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
  }
});
