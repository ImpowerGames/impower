// A backtick string's errors have one owner, the reading of the statement
// the string stands in, in every context (I-1435): the type checker's in a
// function and a story statement, a story store's own reading, a lowerer's
// of a define's method or a Sparkle handler, and the lowerer's reading of the
// expression in story braces, a define's value and an alternator's head and
// arms. The validator reports none of the string's text, so a statement that
// rejects the string before reading it reports Luau's rejection alone. In
// story braces and alternator arms the lowerer's reading owns the
// expression's other errors by form, beside Sparkdown's tree checks. Each
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
      expect(sparkdownErrors(text)).toEqual(officialFirst(`local s = ${string}\n`, 1, -4));
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
  test("an alternator's arm cycle | 1 `a {} b` | 'c' end", () => {
    const text = "store s = cycle | 1 `a {} b` | 'c' end\n";
    expect(sparkdownErrors(text)).toEqual(["0:20-0:24 Expected the end of the expression, got `a {"]);
    expectIncrementalEqualsCold(text);
  });
  // A define's value reports a statement's first error from the tree
  // (`validateAssignmentValue`), where Luau goes on to `got } b``.
  test("a define's value s = 1 `a {} b`", () => {
    const text = "define Thing with\n  s = 1 `a {} b`\nend\n";
    expect(sparkdownErrors(text)).toEqual(["1:8-1:12 Expected identifier when parsing expression, got `a {"]);
    expect(official("local s = 1 `a {} b`\n", 1, -4)).toContain("1:8-1:12 Expected identifier when parsing expression, got `a {");
  });
});

// In story braces and an alternator's arms, Sparkdown's tree checks own the
// forms they name with the closing brace, and the lowerer's reading owns the
// others, in its own words: one owner per form.
describe("story braces and alternator arms: one owner per form", () => {
  const forms: [string, string[]][] = [
    // The reading's.
    ["1 2", ["1:11-1:12 Expected the end of the expression, got '2'"]],
    ["x y", ["1:11-1:12 Expected the end of the expression, got 'y'"]],
    ["(1", ["1:11-2:0 Expected ')' (to close '(' at column 10), got <eof>"]],
    // The tree checks'.
    ["x.", ["1:11-1:12 Expected identifier, got '}'"]],
    ["x +", ["1:12-1:13 Expected identifier when parsing expression, got '}'"]],
    ["not", ["1:12-1:13 Expected identifier when parsing expression, got '}'"]],
    ["x:", ["1:11-1:12 Expected identifier when parsing method name, got '}'"]],
    // Neither's: a call left open (I-1445).
    ["f(", []],
  ];
  for (const [form, expected] of forms) {
    test(`story braces Hello {${form}}.`, () => {
      const text = `scene start\n  Hello {${form}}.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
  }
  const arms: [string, string[]][] = [
    ["1 2", ["0:20-0:21 Expected the end of the expression, got '2'"]],
    ["x y", ["0:20-0:21 Expected the end of the expression, got 'y'"]],
  ];
  for (const [form, expected] of arms) {
    test(`an alternator's arm cycle | ${form} | 3 end`, () => {
      const text = `store s = cycle | ${form} | 3 end\n`;
      expect(sparkdownErrors(text)).toEqual(expected);
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
