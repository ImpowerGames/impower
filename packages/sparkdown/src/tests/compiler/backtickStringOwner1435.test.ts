// A backtick string's errors have one owner, the reading of the statement
// the string stands in, in every context (I-1435): the type checker's in a
// function and a story statement, a story store's own reading, a lowerer's
// of a define's method or a Sparkle handler, and the lowerer's reading of the
// expression in story braces, a define's value and an alternator's head and
// arms. The validator reports none of the string's text, so a statement that
// rejects the string before reading it reports Luau's rejection alone. In
// story braces and alternator arms the lowerer's reading owns the
// expression's other errors too, in Luau's words (I-1445,
// `braceReadingOneOwner1445.test.ts`). Each form reports what a cold
// compile of the same text reports after an edit away from it.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { inPositionOrder, officialErrorList } from "./officialSyntax";
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

/**
 * The official parser's first error for `text`, moved as `official` moves
 * it: a string's own error, where what Luau reads after the string it gave
 * up on is a statement's, which the context reports as its own (a define's
 * value its first error, from the tree; a double-quoted string's
 * interpolation none, being Sparkdown's own syntax).
 */
function officialFirst(text: string, line = 0, shift = 0): string[] {
  const [first] = officialErrorList(text);
  return first ? official(text, line, shift).filter((error) => error.endsWith(first.slice(first.indexOf(" ")))).slice(0, 1) : [];
}

/** The position of `offset` in `text`, as an LSP position. */
function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

/**
 * Compiles `text`, applies one edit to it through `updateDocument`
 * (`insert` at `offset`, replacing `removed` characters), and compiles
 * again: the edited text and the incremental compile's errors.
 */
function incrementally(text: string, offset: number, removed: number, insert: string): { text: string; errors: string[] } {
  const compiler = newCompiler(text);
  compiler.compile({ textDocument: { uri: URI } } as never);
  compiler.updateDocument({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [{ range: { start: positionAt(text, offset), end: positionAt(text, offset + removed) }, text: insert }],
  } as never);
  return { text: text.slice(0, offset) + insert + text.slice(offset + removed), errors: compileErrors(compiler) };
}

// A function ahead of the form, whose `0` an edit makes longer: the edit is
// away from every string, on a line before it, and changes no line count.
const PADDING = "function padding()\n  local p = 0\nend\n";

/** Asserts that an edit in `PADDING` ahead of `text` reports what a cold compile of the edited text does. */
function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  for (const [offset, removed, insert] of [
    [padded.indexOf("0"), 1, "10000000000"],
    [padded.indexOf("local p"), 0, "                                    "],
  ] as const) {
    const edited = incrementally(padded, offset, removed, insert);
    expect(edited.errors, `after ${JSON.stringify(insert)}`).toEqual(sparkdownErrors(edited.text));
  }
}

// Forms of a string's own errors: an empty interpolation, a stray token in
// one, a malformed escape in a section with an interpolation after it, and
// one in the last section, each with a closing backtick.
const OWN = ["`a {} b`", "`a {1 2} b`", "`a\\x {y} b`", "`a {y} b\\x`"];
// The same with no closing backtick, which runs to the end of its line.
const UNFINISHED = ["`a {x} b", "`a {1 2} b", "`a {} b"];

describe("a backtick string's own errors, from the reading of the statement it stands in", () => {
  for (const string of [...OWN, ...UNFINISHED]) {
    test(`a function's local s = ${string}`, () => {
      const luau = `function f()\n  local s = ${string}\n  return s\nend\n`;
      const expected = official(luau);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(luau)).toEqual(expected);
    });
    test(`a story store s = ${string}`, () => {
      const text = `store s = ${string}\n`;
      expect(sparkdownErrors(text)).toEqual(official(`local s = ${string}\n`));
      expectIncrementalEqualsCold(text);
    });
    test(`a scene's local s = ${string}`, () => {
      const text = `scene start\n  local s = ${string}\n  Hello.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(official(`local s = ${string}\n`, 1, 2));
      expectIncrementalEqualsCold(text);
    });
    test(`a define's value s = ${string}`, () => {
      const text = `define Thing with\n  s = ${string}\nend\n`;
      // A property's reading reports every error of its value (I-1500).
      expect(sparkdownErrors(text)).toEqual(official(`local s = ${string}\n`, 1, -4));
      expectIncrementalEqualsCold(text);
    });
  }
  // A string Luau reads on after (`a {1 2} b`) leaves an if-condition's
  // `then` to the tokens after it, which a story statement's reading does
  // not report (a follow-up of I-1435).
  for (const string of ["`a {} b`", "`a {y} b\\x`"]) {
    test(`an if-condition ${string} == "x"`, () => {
      const text = `scene start\n  if ${string} == "x" then\n    Hi.\n  end\nend\n`;
      expect(sparkdownErrors(text)).toEqual(official(`if ${string} == "x" then\nend\n`, 1, 2));
      expectIncrementalEqualsCold(text);
    });
    test(`a double-quoted string's interpolation in a store, "a {${string}} b"`, () => {
      const text = `store s = "a {${string}} b"\n`;
      expect(sparkdownErrors(text)).toEqual(officialFirst(`local s = ${string}\n`, 0, 4));
      expectIncrementalEqualsCold(text);
    });
  }
});

// What the lowerer's reading of an expression standing alone reports after
// a string's own error, at the first token after the string it gave up on.
const REST: Record<string, [number, string] | undefined> = {
  "`a {1 2} b`": [6, "'2'"],
  "`a\\x {y} b`": [6, "'y'"],
};

/**
 * The errors of `string` read alone at `line`:`column`: Luau's own error
 * for the string, as the official parser gives it for `local _ = ...`, then
 * the reading's end of the expression at the first token after it.
 */
function aloneAt(string: string, line: number, column: number): string[] {
  const [own] = officialFirst(`local _ = ${string}\n`, line, column - 10);
  const rest = REST[string];
  const errors = [own!];
  if (rest) errors.push(`${line}:${column + rest[0]}-${line}:${column + rest[0] + rest[1].length - 2} Expected the end of the expression, got ${rest[1]}`);
  return errors.sort();
}

describe("a backtick string's own errors, from the lowerer's reading where no other reading reads it", () => {
  for (const string of OWN) {
    const places: [string, string, number, number][] = [
      ["story braces", `scene start\n  Hello {${string}}.\nend\n`, 1, 9],
      ["dialogue braces", `scene start\n  @ BOB\n  Hi {${string}}.\nend\n`, 2, 6],
      ["an alternator's arm in story braces", `scene start\n  Hello {cycle | ${string} | 'c' end}.\nend\n`, 1, 17],
      ["an alternator's arm in a store's value", `store s = cycle | ${string} | 'c' end\n`, 0, 18],
      ["an alternator's arm in a scene's local", `scene start\n  local s = cycle | ${string} | 'c' end\n  Hello.\nend\n`, 1, 20],
      ["a sequential alternator's head in a store's value", `store s = cycle ${string} | 'c' end\n`, 0, 16],
      ["a sequential alternator's head in story braces", `scene start\n  Hello {cycle ${string} | 'c' end}.\nend\n`, 1, 15],
      ["a match arm's pattern", `store s = match x | ${string} = 1 | 2 end\n`, 0, 20],
    ];
    for (const [place, text, line, column] of places) {
      test(`${place}: ${string}`, () => {
        expect(sparkdownErrors(text)).toEqual(aloneAt(string, line, column));
        expectIncrementalEqualsCold(text);
      });
    }
  }
});

// What no lowerer lowers is still read for the string's errors: a `match`
// alternator's condition and an alternator nested in another's arm where
// Luau code uses the outer one as a value, a define's computed key, and an
// alternator in a tag's braces (round 1).
describe("a backtick string where no lowerer lowers the expression it stands in", () => {
  const places: [string, string, number, number][] = [
    ["a match alternator's condition, used as a value", "store c = match `a {} b` | 1 = 'one' | 'other' end\n", 0, 16],
    ["an alternator in parentheses in another's arm, used as a value", "store n = cycle | (cycle | `a {} b` | 'ok' end) | 'last' end\n", 0, 27],
    ["an alternator in another's arm, used as a value", "store n = cycle | cycle | `a {} b` | 'ok' end | 'last' end\n", 0, 26],
    ["an alternator in a sequential alternator's head, used as a value", "store n = cycle (cycle | `a {} b` | 'ok' end) | 'last' end\n", 0, 25],
    ["a define's computed key", "define Thing with\n  [`a {} b`] = 1\nend\n", 1, 3],
    // A statement in an arm, in a story alternator's block and in one Luau
    // code uses as a value (round 1).
    ["a statement in a story alternator's arm", "scene start\n  cycle\n    |\n      local s = `a {} b`\n    |\n      Hi.\n  end\nend\n", 3, 16],
    ["a statement in the arm of an alternator used as a value", "function f()\n  local c = cycle |\n    local s = `a {} b`\n  | 2 end\nend\n", 2, 14],
    ["an alternator in a tag's braces", "scene start\n  Hello # tag {cycle | `a {} b` | 2 end}\nend\n", 1, 23],
  ];
  for (const [place, text, line, column] of places) {
    test(place, () => {
      expect(sparkdownErrors(text)).toEqual(officialFirst("local _ = `a {} b`\n", line, column - 10));
      expectIncrementalEqualsCold(text);
    });
  }
});

// A tag's braces hold an expression the tag shows as its text unless it is
// one name, so only the string's own error is reported there.
describe("a backtick string's own error in a tag's braces", () => {
  for (const string of OWN) {
    test(`Hello # tag {${string}}`, () => {
      const text = `scene start\n  Hello # tag {${string}}\nend\n`;
      expect(sparkdownErrors(text)).toEqual(officialFirst(`local _ = ${string}\n`, 1, 5));
      expectIncrementalEqualsCold(text);
    });
  }
});

describe("a string the statement rejects reports the statement's error, none of the string's own", () => {
  for (const rest of ["s = (1 `a {} b`)", "s = 1 `a {} b`", "s = (1 `a\\x {y} b`)", "s = x.`a {} b`"]) {
    test(`a function's local ${rest}`, () => {
      const luau = `function f()\n  local ${rest}\n  return s\nend\n`;
      expect(sparkdownErrors(luau)).toEqual(official(luau));
    });
    // A store's value read on after its end describes the string whole (I-1429).
    if (rest === "s = 1 `a {} b`") continue;
    test(`a story store ${rest}`, () => {
      const text = `store ${rest}\n`;
      expect(sparkdownErrors(text)).toEqual(official(`local ${rest}\n`));
      expectIncrementalEqualsCold(text);
    });
  }
  test("story braces Hello {1 `a {} b`}.", () => {
    const text = "scene start\n  Hello {1 `a {} b`}.\nend\n";
    expect(sparkdownErrors(text)).toEqual(["1:11-1:15 Expected the end of the expression, got `a {"]);
    expectIncrementalEqualsCold(text);
  });
  // An arm is a sequence of values, each lowered on its own (`lowerArms`):
  // `1` and the string are two values, so the string is read as one and
  // its own error stands.
  test("an alternator's arm cycle | 1 `a {} b` | 'c' end", () => {
    const text = "store s = cycle | 1 `a {} b` | 'c' end\n";
    expect(sparkdownErrors(text)).toEqual(officialFirst("local _ = `a {} b`\n", 0, 10));
    expectIncrementalEqualsCold(text);
  });
  // A define's value reports a statement's first error from the tree
  // (`validateAssignmentValue`); the string after it begins a statement of
  // the body, whose reading goes on to Luau's `got } b``, as the official
  // parser does (I-1489).
  test("a define's value s = 1 `a {} b`", () => {
    const text = "define Thing with\n  s = 1 `a {} b`\nend\n";
    const both = [
      "1:8-1:12 Expected identifier when parsing expression, got `a {",
      "1:12-1:16 Expected identifier when parsing expression, got } b`",
    ];
    expect(inPositionOrder(sparkdownErrors(text))).toEqual(both);
    expect(inPositionOrder(official("local s = 1 `a {} b`\n", 1, -4))).toEqual(both);
    expectIncrementalEqualsCold(text);
  });
});

// In story braces and an alternator's arms, the lowerer's reading owns every
// form, in Luau's words, naming the closing brace it ends at (I-1445).
describe("story braces and alternator arms: one owner per form", () => {
  const forms: [string, string[]][] = [
    ["1 2", ["1:11-1:12 Expected the end of the expression, got '2'"]],
    ["x y", ["1:11-1:12 Expected the end of the expression, got 'y'"]],
    ["(1", ["1:11-1:12 Expected ')' (to close '(' at column 10), got '}'"]],
    ["x.", ["1:11-1:12 Expected identifier, got '}'"]],
    ["x +", ["1:12-1:13 Expected identifier when parsing expression, got '}'"]],
    ["not", ["1:12-1:13 Expected identifier when parsing expression, got '}'"]],
    ["x:", ["1:11-1:12 Expected identifier when parsing method name, got '}'", "1:9-1:11 Expected '(', '{' or <string> when parsing function call, got '}'"]],
    ["f(", ["1:11-1:12 Expected identifier when parsing expression, got '}'"]],
  ];
  for (const [form, expected] of forms) {
    test(`story braces Hello {${form}}.`, () => {
      const text = `scene start\n  Hello {${form}}.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
  }
  // In an arm, values side by side are a sequence (`| second visit |`); the
  // forms are those within one value, and an operation continues the value
  // before it.
  const arms: [string, string[]][] = [
    ["1 2", []],
    ["x y", []],
    ["(1 2)", ["0:21-0:22 Expected ')' (to close '(' at column 19), got '2'"]],
    ["(x y)", ["0:21-0:22 Expected ')' (to close '(' at column 19), got 'y'"]],
    ["x .. `a {} b`", officialFirst("local _ = `a {} b`\n", 0, 13)],
  ];
  for (const [form, expected] of arms) {
    test(`an alternator's arm cycle | ${form} | 3 end`, () => {
      const text = `store s = cycle | ${form} | 3 end\n`;
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
  }
});

// The undirected review of round 1: a string whose first interpolation is
// left open where a statement rejects it, a define's value dropped with its
// key, and errors beside a whole if expression in story braces.
describe("round 1's undirected probes", () => {
  for (const line of [
    "local s = (1 `a {x)",
    "local s = (1 `a {x`)",
    "local s = x.`a {x",
    "local s = `a {x",
    "local s = `a",
    "local s = (1 `a`",
    "local s = `a\\x`",
    "local s = `a {x} b\\x {y} c`",
    "local s = (1 `a\\x {x)",
  ]) {
    test(`a function's ${line}`, () => {
      const luau = `function f()\n${line}\nend\n`;
      expect(sparkdownErrors(luau)).toEqual(official(luau));
    });
  }
  test("a define's value whose key does not lower", () => {
    const text = "define Thing with\n  [`a {} b`] = `c {} d`\nend\n";
    expect(sparkdownErrors(text)).toEqual(
      [...officialFirst("local _ = `a {} b`\n", 1, -7), ...officialFirst("local _ = `c {} d`\n", 1, 5)].sort(),
    );
    expectIncrementalEqualsCold(text);
  });
  // An expression that holds an if expression reports every error of its
  // reading too (I-1445).
  for (const [expr, expected] of [
    ["(if true then 1 else 2) 3", ["1:33-1:34 Expected the end of the expression, got '3'"]],
    ["(if true then 1 else 2) `a {} b`", ["1:33-1:37 Expected the end of the expression, got `a {"]],
    ["(if true then 1 else 2", ["1:31-1:32 Expected ')' (to close '(' at column 10), got '}'"]],
    ["if true then `a {} b` else 'ok'", officialFirst("local _ = `a {} b`\n", 1, 12)],
  ] as const) {
    test(`story braces Hello {${expr}}.`, () => {
      const text = `scene start\n  Hello {${expr}}.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
  }
});

// Round 2's author-experience probes: a define's value on the line after its
// `=` dropped with a key that does not lower, and a story `match`'s
// condition that rejects a string.
describe("round 2's author-experience probes", () => {
  test("a define's value on the next line, whose key does not lower", () => {
    const text = "define Bad with\n  [`a {} b`] =\n    `c {} d`\nend\n";
    expect(sparkdownErrors(text)).toEqual(
      [...officialFirst("local _ = `a {} b`\n", 1, -7), ...officialFirst("local _ = `c {} d`\n", 2, -6)].sort(),
    );
    expectIncrementalEqualsCold(text);
  });
  test("a story match condition that rejects a string", () => {
    const text = "scene start\n  Hello {match 1 `a {} b` | 1 = 'ok' end}.\nend\n";
    expect(sparkdownErrors(text)).toEqual(["1:17-1:21 Expected the end of the expression, got `a {"]);
    expectIncrementalEqualsCold(text);
  });
  test("a story match condition that holds a string", () => {
    const text = "scene start\n  Hello {match `a {} b` | 1 = 'ok' end}.\nend\n";
    expect(sparkdownErrors(text)).toEqual(officialFirst("local _ = `a {} b`\n", 1, 5));
    expectIncrementalEqualsCold(text);
  });
  test("a parenthesized story match condition that rejects a string", () => {
    const text = "scene start\n  Hello {match (1 `a {} b`) | 1 = 'ok' end}.\nend\n";
    const errors = sparkdownErrors(text);
    expect(errors).toContain("1:18-1:22 Expected ')' (to close '(' at column 16), got `a {");
    expect(errors.some((e) => e.includes("expected expression inside"))).toBe(false);
    expectIncrementalEqualsCold(text);
  });
});

// Round 2's undirected probes: an alternator a value holds after one that
// lowers to nothing, which lowering never reaches.
describe("round 2's undirected probes", () => {
  for (const [text, line, column] of [
    ["store s = (cycle | 1 | 2 end) .. (cycle | `a {} b` | 3 end)\n", 0, 42],
    ["store s = if (cycle | 1 | 2 end) then (cycle | `a {} b` | 3 end) else 0\n", 0, 47],
    ["define Thing with\n  s = (cycle | 1 | 2 end) .. (cycle | `a {} b` | 3 end)\nend\n", 1, 38],
  ] as const) {
    test(text.split("\n").find((l) => l.includes("`"))!.trim(), () => {
      expect(sparkdownErrors(text)).toEqual(officialFirst("local _ = `a {} b`\n", line, column - 10));
      expectIncrementalEqualsCold(text);
    });
  }
  test("store s = `c {} d` .. (cycle | `a {} b` | 3 end)", () => {
    const text = "store s = `c {} d` .. (cycle | `a {} b` | 3 end)\n";
    expect(sparkdownErrors(text)).toEqual([...officialFirst("local _ = `c {} d`\n", 0, 0), ...officialFirst("local _ = `a {} b`\n", 0, 21)].sort());
    expectIncrementalEqualsCold(text);
  });
});

// Round 3's undirected probes: a rejection inside a whole if expression's
// condition or value is the reading's, not the if expression's own.
describe("round 3's undirected probes", () => {
  test("story braces Hello {if true then 1 else (2 `a {} b`)}.", () => {
    const text = "scene start\n  Hello {if true then 1 else (2 `a {} b`)}.\nend\n";
    // The official parser over the same expression at the same columns.
    expect(official("\n  return if true then 1 else (2 `a {} b`)\n")).toContain("1:32-1:36 Expected ')' (to close '(' at column 30), got `a {");
    expect(sparkdownErrors(text)).toEqual(["1:32-1:36 Expected ')' (to close '(' at column 30), got `a {"]);
    expectIncrementalEqualsCold(text);
  });
  // With Luau's recovery after the rejection, which the reading reports too
  // (I-1445).
  for (const [expr, expected] of [
    [
      "if (1 `a {} b`) then 1 else 2",
      ["1:15-1:19 Expected ')' (to close '(' at column 13), got `a {", "1:23-1:24 Expected 'else' when parsing if then else expression, got ')'"],
    ],
    [
      "if true then (1 `a {} b`) else 2",
      ["1:25-1:29 Expected ')' (to close '(' at column 23), got `a {", "1:33-1:34 Expected the end of the expression, got ')'"],
    ],
  ] as const) {
    test(`story braces Hello {${expr}}.`, () => {
      const text = `scene start\n  Hello {${expr}}.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
  }
});

// Round 4's undirected probes: an if expression whose recovery leaves a part
// in error, in choice text, parenthesized in story text and in an arm,
// reports the rejection of the string in its condition or value, and every
// other error of the reading, Luau's recovery's included (I-1445, which
// took back the retreat these probes pinned).
describe("round 4's undirected probes", () => {
  const contexts = [
    ["choice text", (expr: string) => `scene start\n  choose\n    * Hello {${expr}}.\n  end\nend\n`],
    ["parenthesized story text", (expr: string) => `scene start\n  Hello {(${expr})}.\nend\n`],
    ["an arm", (expr: string) => `store s = cycle | (${expr}) | 2 end\n`],
  ] as const;
  const expected: Record<string, Record<string, string[]>> = {
    "choice text": {
      "if (2 `a {} b`) then 1 else 2": ["2:19-2:23 Expected ')' (to close '(' at column 17), got `a {", "2:27-2:28 Expected 'else' when parsing if then else expression, got ')'"],
      "if true then (2 `a {} b`) else 2": ["2:29-2:33 Expected ')' (to close '(' at column 27), got `a {", "2:37-2:38 Expected the end of the expression, got ')'"],
      "if true then 1 else (2 3)": ["2:36-2:37 Expected ')' (to close '(' at column 34), got '3'"],
      "if (1 2) then 1 else 2": ["2:19-2:20 Expected ')' (to close '(' at column 17), got '2'", "2:20-2:21 Expected 'else' when parsing if then else expression, got ')'"],
    },
    "parenthesized story text": {
      "if (2 `a {} b`) then 1 else 2": [
        "1:16-1:20 Expected ')' (to close '(' at column 14), got `a {",
        "1:24-1:25 Expected 'else' when parsing if then else expression, got ')'",
        "1:26-1:30 Expected the end of the expression, got 'then'",
      ],
      "if true then (2 `a {} b`) else 2": ["1:26-1:30 Expected ')' (to close '(' at column 24), got `a {", "1:36-1:40 Expected the end of the expression, got 'else'"],
      "if true then 1 else (2 3)": ["1:33-1:34 Expected ')' (to close '(' at column 31), got '3'"],
      "if (1 2) then 1 else 2": [
        "1:16-1:17 Expected ')' (to close '(' at column 14), got '2'",
        "1:17-1:18 Expected 'else' when parsing if then else expression, got ')'",
        "1:19-1:23 Expected the end of the expression, got 'then'",
      ],
    },
    "an arm": {
      "if (2 `a {} b`) then 1 else 2": [
        "0:25-0:29 Expected ')' (to close '(' at column 23), got `a {",
        "0:33-0:34 Expected 'else' when parsing if then else expression, got ')'",
        "0:35-0:39 Expected the end of the expression, got 'then'",
      ],
      "if true then (2 `a {} b`) else 2": ["0:35-0:39 Expected ')' (to close '(' at column 33), got `a {", "0:45-0:49 Expected the end of the expression, got 'else'"],
      "if true then 1 else (2 3)": ["0:42-0:43 Expected ')' (to close '(' at column 40), got '3'"],
      "if (1 2) then 1 else 2": [
        "0:25-0:26 Expected ')' (to close '(' at column 23), got '2'",
        "0:26-0:27 Expected 'else' when parsing if then else expression, got ')'",
        "0:28-0:32 Expected the end of the expression, got 'then'",
      ],
    },
  };
  for (const [place, wrap] of contexts) {
    for (const [expr, errors] of Object.entries(expected[place]!)) {
      test(`${place}: ${expr}`, () => {
        const text = wrap(expr);
        expect(sparkdownErrors(text)).toEqual(errors);
        expectIncrementalEqualsCold(text);
      });
    }
  }
  for (const [expr, errors] of [
    ["if true then 1 else (2 3)", ["1:32-1:33 Expected ')' (to close '(' at column 30), got '3'"]],
    ["if (1 2) then 1 else 2", ["1:15-1:16 Expected ')' (to close '(' at column 13), got '2'", "1:16-1:17 Expected 'else' when parsing if then else expression, got ')'"]],
  ] as const) {
    test(`story braces Hello {${expr}}.`, () => {
      const text = `scene start\n  Hello {${expr}}.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(errors);
      expectIncrementalEqualsCold(text);
    });
  }
});

// The probes of I-1419's fourth review round: a string split over lines by
// an escape, and a statement's error at the string's first lexeme after
// which Luau reads the string on, in a function the type checker reads and
// in a define's method the lowerer reads.
describe("the round-4 ownership probes (I-1419)", () => {
  const bodies = [
    "function `a \\\nb {x} c {} d`() end",
    "local function g(`a \\\nb {x} c {} d`) end",
    "for i `a \\\nb {x} c {} d` do end",
    "function `a \\z\n  b {x} c {} d`() end",
    "local function g(`a \\z\n  b {x} c {} d`) end",
    "for i `a \\z\n  b {x} c {} d` do end",
    "for i `a {x} b {} c` do end",
    "while true `a {x} b {} c` do end",
    "local s: `a {x} b {} c` = 1",
    "if true `a {x} b {} c` then end",
  ];
  for (const body of bodies) {
    test(`a function's ${JSON.stringify(body)}`, () => {
      const luau = `function f()\n${body}\nend\n`;
      expect(sparkdownErrors(`${luau}Go {f()}.\n`)).toEqual(official(luau));
    });
    if (!body.includes("\n")) continue;
    test(`a define's method ${JSON.stringify(body)}`, () => {
      expect(sparkdownErrors(`define Thing with\n  run()\n    ${body}\n  end\nend\n`)).toEqual(official(`\n\n    ${body}\n`));
    });
  }

  // The unrelated-error probe: Luau's error at the string's first lexeme is
  // the loop's, and the string is still read, so its own error stands too.
  test("for i `a {x} b {} c` do end reports both errors", () => {
    expect(sparkdownErrors("function f()\nfor i `a {x} b {} c` do end\nend\nGo {f()}.\n")).toEqual(
      [
        "1:6-1:10 Expected 'in' when parsing for loop, got `a {",
        "1:11-1:16 Malformed interpolated string, expected expression inside '{}'",
      ].sort(),
    );
  });
});

// An edit ahead of a string, away from it, which a compile carries the
// string's statement past: the incremental compile reports what a cold one
// does (I-1419's fourth round, which found the validator's lexeme offsets
// left behind by the edit).
describe("an edit away from the string reports what a cold compile does", () => {
  const padding = (count: number) => `function padding()\n${"local p = 0\n".repeat(count)}end\n`;
  for (const count of [4, 8, 16, 80]) {
    test(`a distant edit with ${count} padding statements`, () => {
      const text = `${padding(count)}function f()\nfunction \`a {x} b {} c\`() end\nend\n`;
      const edited = incrementally(text, text.indexOf("0"), 1, "10000000000");
      const cold = sparkdownErrors(edited.text);
      expect(cold.some((e) => e.includes("expected expression inside")), "Luau reports no string error in a rejected function name").toBe(false);
      expect(edited.errors).toEqual(cold);
    });
  }
  test("a stale range can point to an unrelated string's error", () => {
    const text = `${padding(80)}function f()\nfunction \`b {x} c\`() end\nend\nstore s = cycle \`a {} b\` | 'c' end\n`;
    const edited = incrementally(text, text.indexOf("0") + 1, 0, " ".repeat(36));
    const cold = sparkdownErrors(edited.text);
    expect(cold).toContain("85:16-85:20 Malformed interpolated string, expected expression inside '{}'");
    expect(edited.errors).toEqual(cold);
  });
});

describe("a body a lowerer reads", () => {
  for (const body of ["local t = `a\\x {y} b`", "local t = (1 `a\\x {y} b`)", "local t = `a {x} b"]) {
    const expected = () => official(`\n\n    ${body}\n`);
    test(`a define's method ${body}`, () => {
      expect(expected().length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`define Thing with\n  run()\n    ${body}\n  end\nend\n`)).toEqual(expected());
    });
    test(`a Sparkle handler ${body}`, () => {
      expect(sparkdownErrors(`layout main with\n  button @click={\n    ${body}\n  }\nend\n`)).toEqual(expected());
    });
  }
});
