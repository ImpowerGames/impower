import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";

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

function sparkdownErrors(text: string): string[] {
  return compileErrors(newCompiler(text));
}

function official(text: string, line = 0, shift = 0): string[] {
  return officialErrorList(text)
    .map((error) =>
      error.replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + line}:${+sc + shift}-${+el + line}:${+ec + shift}`),
    )
    .sort();
}

function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

const PADDING = "function padding()\n  local p = 0\nend\n";

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

interface Place {
  name: string;
  wrap: (expr: string) => string;
  line: number;
  column: number;
  end: "}" | "|";
  next?: number;
}

const STORY: Place = { name: "story text", wrap: (e) => `scene start\n  Hello {${e}}.\nend\n`, line: 1, column: 9, end: "}" };
const DIALOGUE: Place = { name: "dialogue", wrap: (e) => `scene start\n  @ BOB\n  Hi {${e}}.\nend\n`, line: 2, column: 6, end: "}" };
const CHOICE: Place = { name: "choice text", wrap: (e) => `scene start\n  choose\n    * Go {${e}}.\n      Hi.\n  end\nend\n`, line: 2, column: 10, end: "}" };
const ARM: Place = { name: "a store's arm", wrap: (e) => `store s = cycle | ${e} | 3 end\n`, line: 0, column: 18, end: "|" };
const BRACE_ARM: Place = { name: "a story brace's arm", wrap: (e) => `scene start\n  Hello {cycle | ${e} | 3 end}.\nend\n`, line: 1, column: 17, end: "|" };
const MATCH_HEAD: Place = { name: "a story brace's match condition", wrap: (e) => `scene start\n  Hello {match ${e} | 1 = 2 end}.\nend\n`, line: 1, column: 15, end: "|" };
const STORE_LINE_HEAD: Place = { name: "a store's multiline match condition", wrap: (e) => `store s = (\n  match ${e}\n  | 1 = 2\n  end\n)\n`, line: 1, column: 8, end: "|", next: 2 };
const FUNCTION_LINE_HEAD: Place = {
  name: "a function's multiline cycle head",
  wrap: (e) => `function f()\n  local c = (\n    cycle ${e}\n    | 1\n    end\n  )\n  return c\nend\nGo {f()}.\n`,
  line: 2,
  column: 10,
  end: "|",
  next: 4,
};
const STORY_MATCH: Place = { name: "a story match's condition", wrap: (e) => `scene start\n  match ${e}\n  | 1 = Hello.\n  end\nend\n`, line: 1, column: 8, end: "|", next: 2 };

function oracleText(place: Place, expr: string): string {
  const head = `${"\n".repeat(place.line)}_ =${" ".repeat(place.column - 4)}{${expr}`;
  if (place.next !== undefined) return `${head}\n${" ".repeat(place.next)}}\n`;
  return `${head}${place.end === "|" ? " " : ""}}\n`;
}

function oracle(place: Place, expr: string): string[] {
  const brace = place.column - 1;
  return official(oracleText(place, expr)).map((error) => {
    let mapped = error.replace(new RegExp(`Expected '\\}' \\(to close '\\{' at column ${brace + 1}\\), got`), "Expected the end of the expression, got");
    if (place.end === "|") mapped = mapped.replace(/got '\}'$/, "got '|'");
    return mapped;
  });
}

function expectLuauErrors(place: Place, expr: string): void {
  const text = place.wrap(expr);
  const errors = sparkdownErrors(text);
  const expected = oracle(place, expr);
  expect(errors.length > 0, `${JSON.stringify(errors)} against Luau's ${JSON.stringify(expected)}`).toBe(expected.length > 0);
  expect(errors, "no error reported twice").toEqual([...new Set(errors)]);
  for (const error of errors) expect(expected, "an error Luau reports").toContain(error);
  if (expected.length > 0) {
    const [first] = officialErrorList(oracleText(place, expr));
    const firstMessage = first!.slice(first!.indexOf(" ") + 1);
    expect(
      errors.some((error) => error.endsWith(firstMessage.replace(/got '\}'$/, `got '${place.end}'`)) || /Expected the end of the expression/.test(error)),
      `Luau's first error, ${first}`,
    ).toBe(true);
  }
  expectIncrementalEqualsCold(text);
}

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

const SIDE_BY_SIDE = ["1 2", "x y", "(if true then 1 else 2) 3", "1 `a {} b`"];

const BRACE_ONLY = ["x ==", "x:", "x::", "if true", "if then 1 else 2", "if true then else 2", "if true then 1 else (2 3)", "if (1 2) then 1 else 2"];

describe("story braces, dialogue and choice text: the reading reports Luau's errors", () => {
  for (const place of [STORY, DIALOGUE, CHOICE]) {
    for (const expr of [...VALUE_FORMS, ...SIDE_BY_SIDE, ...BRACE_ONLY]) {
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
    for (const expr of SIDE_BY_SIDE.slice(0, 3)) {
      test(`${place.name}: | ${expr} | is a sequence`, () => {
        const text = place.wrap(expr);
        expect(sparkdownErrors(text)).toEqual([]);
        expectIncrementalEqualsCold(text);
      });
    }
  }
  for (const expr of ["x.", "x +", "x and", "(1 2)", "f(1 2)", "x[1 2]", "t[]", "()", "x:m", "(x.)", "a.b.c.", "x =="]) {
    test(`${MATCH_HEAD.name}: match ${expr} |`, () => expectLuauErrors(MATCH_HEAD, expr));
  }
  for (const place of [STORE_LINE_HEAD, FUNCTION_LINE_HEAD, STORY_MATCH]) {
    for (const expr of ["x.", "x +", "x and", "(1 2)", "f(1 2)", "x[1 2]", "t[]", "()", "(x.)", "a.b.c."]) {
      test(`${place.name}: ${expr}`, () => expectLuauErrors(place, expr));
    }
  }
});

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
    for (const [expr, message] of [
      ["if true then 1 elseif x.", "Expected identifier, got '}'"],
      ["if true then 1 elseif x", "Expected 'then' when parsing if then else expression, got '}'"],
      ["if true then 1 elseif x then", "Expected identifier when parsing expression, got '}'"],
    ] as const) {
      test(`${place.name}: {${expr}} reports what the elseif lacks`, () => {
        const text = place.wrap(expr);
        const errors = sparkdownErrors(text);
        expect(errors).toHaveLength(1);
        expect(errors[0]!.endsWith(` ${message}`), errors[0]).toBe(true);
        expectIncrementalEqualsCold(text);
      });
    }
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
