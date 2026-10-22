// The backtick-string readings left after one owner for a string's errors
// (I-1435), each reporting the official parser's errors once at Luau's
// ranges (I-1451): an interpolation holding an expression and then a
// backtick string with interpolations (I-1427), a story store's run-on
// value that is such a string (I-1429), a malformed interpolation in a
// scene-level call's argument (I-1433), and an interpolation left open
// inside a call, after which Luau reads on from the next line (I-1343).
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { lexLuauDocumentForTesting, nextLuauToken, noteLuauDocumentEdit, readLuauExpressionAfter } from "../../compiler/typecheck/readLuauAst";
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

// A function ahead of the form, whose `0` an edit makes longer: the edit is
// away from every string, on a line before it, and changes no line count.
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
 * The official parser's errors for `text`, moved down by `line` lines and
 * right by `shift` characters, with the bracket positions their messages
 * name (`at column 6`, `at line 2`) moved too.
 */
function official(text: string, line = 0, shift = 0): string[] {
  return officialErrorList(text)
    .map((error) =>
      error
        .replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + line}:${+sc + shift}-${+el + line}:${+ec + shift}`)
        .replace(/at column (\d+)\)/, (_, column) => `at column ${+column + shift})`)
        .replace(/at line (\d+)\)/, (_, at) => `at line ${+at + line})`),
    )
    .sort();
}

describe("an interpolation holding an expression and then a backtick string with interpolations (I-1427)", () => {
  for (const string of ["`a {1 `b {x} c`} d`", "`a {1 `b {x} c` 2} d`", "`a {1 `b {x} c {y} e`} d`", "`a {1 `b`} d`", "`a {1 2} b`"]) {
    test(`a function's local t = ${string}`, () => {
      const luau = `local t = ${string}\n`;
      const expected = official(luau, 1);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`function f()\n${luau}end\nGo {f()}.\n`)).toEqual(expected);
    });
    test(`a story store t = ${string}`, () => {
      expect(sparkdownErrors(`store t = ${string}\n`)).toEqual(official(`local t = ${string}\n`));
      expectIncrementalEqualsCold(`store t = ${string}\n`);
    });
  }
});

describe("a story store's run-on value that is a backtick string with interpolations (I-1429)", () => {
  for (const string of ["`a {x} b`", "`a {x} b {y} c`", "`a {x}`"]) {
    for (const tail of ["", "scene start\n  Hello.\nend\n"]) {
      test(`store s = 1 ${string}${tail ? " before a scene" : ""}`, () => {
        const expected = official(`local s = 1 ${string}\n`);
        expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(`store s = 1 ${string}\n${tail}`)).toEqual(expected);
        expectIncrementalEqualsCold(`store s = 1 ${string}\n${tail}`);
      });
    }
  }
});

describe("a malformed interpolation in a scene-level call's argument (I-1433)", () => {
  // A scene-level call is a Luau statement written after `&`; without it
  // the line is display text, whose backticks are a raw span, not Luau.
  for (const line of ["print(`a {} b`)", "print(`a {1 2} b`)", "print(`a {x y} b`)", "print(1, `a {} b`)", "print(1, `a {1 2} b`)", "print((`a {} b`))"]) {
    test(`& ${line}`, () => {
      const expected = official(`${line}\n`, 1, 4);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`scene start\n  & ${line}\n  Hello.\nend\n`)).toEqual(expected);
    });
    test(`display text: ${line}`, () => {
      expect(sparkdownErrors(`scene start\n  ${line}\n  Hello.\nend\n`)).toEqual([]);
    });
  }
  // The positions that already reported the string's errors keep them.
  for (const line of ["s = `a {} b`", "local x = print(`a {} b`)"]) {
    test(`unchanged: ${line}`, () => {
      expect(sparkdownErrors(`scene start\n  ${line}\n  Hello.\nend\n`)).toEqual(official(`${line}\n`, 1, 2));
    });
  }
});

describe("an interpolation left open inside a call reads on from the line after it (I-1343)", () => {
  for (const body of ["  f(`a {b\n  x = 1\n", "  local s = `a {b +\n  x = 1\n", "  local s = `a {b\n  x = 1\n", "  f(`a {b\n  x\n  }`)\n", "  f(1, `a {b\n  x = 1\n"]) {
    test(JSON.stringify(body), () => {
      const luau = `function run()\n${body}end\n`;
      const expected = official(luau);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`${luau}After {run()}.\n`)).toEqual(expected);
    });
  }
});

// Round 1's boundaries: a string read from text whose section holds a
// Unicode escape or ends its line, and a string continued through another's
// sections whose escape is malformed or whose interpolation the grammar
// leaves open.
describe("a backtick string's boundaries, as Luau reads them", () => {
  const forms = [
    "1 g(`a \\u{41} b`)",
    "1 g(`a {x} \\u{41} b {y} c`)",
    "1 g(`a {x} b",
    "1 g(`a {x}",
    "1 g(`a {x} b {y",
    "1 g(`a {} b",
    "1 g(`a {x} b, 2)",
    "`a {1 `b {x} c\\x`} d`",
    "`a {1 `b\\x {x} c`} d`",
    "`a {1 `b {x} c\\x {y} e`} d`",
    "`a {1 `b {x} c} d`",
    "`a {1 `b {x} c} d` + 1",
    "`a \\u{41} {x} b`",
  ];
  // A store ends at its line (its value too), and with an unclosed call its
  // reading meets the end of its input where Luau's names the next line
  // (`at line 1`, as for `store s = 1 g(x`, outside this change): those
  // forms are compared up to that error.
  const callEnd = /^\d+:\d+-1:0 Expected '\)' \(to close '\(' at /;
  for (const value of forms) {
    test(`store s = ${JSON.stringify(value)}`, () => {
      const expected = official(`local s = ${value}\n`).filter((error) => !callEnd.test(error));
      expect(sparkdownErrors(`store s = ${value}\n`).filter((error) => !callEnd.test(error))).toEqual(expected);
    });
  }
  for (const value of [...forms, "1 g(`a \\z\n  {x} b`)"]) {
    test(`a function's local s = ${JSON.stringify(value)}`, () => {
      const luau = `function f()\nlocal s = ${value}\nend\n`;
      expect(sparkdownErrors(`${luau}Go {f()}.\n`)).toEqual(official(luau));
    });
  }
  test("a read bounded inside a string's section reads what the text up to the bound gives", () => {
    const source = "`a {x} tail`";
    for (let to = 1; to <= source.length; to++) {
      forgetLookups();
      nextLuauToken(source.length, source);
      const bounded = readLuauExpressionAfter(0, source, to);
      forgetLookups();
      expect(bounded.errors, `to ${to}`).toEqual(readLuauExpressionAfter(0, source.slice(0, to)).errors);
    }
  });
});

/** Empties the lookups' tokens, so the next lookup lexes the whole document. */
function forgetLookups() {
  nextLuauToken(0, "");
}

// The lookups' lexer keeps the tokens before an edit and lexes on from the
// last of them, inside the interpolations it leaves open (round 1).
describe("the lookups after an edit inside a backtick string's interpolation", () => {
  const forget = () => nextLuauToken(0, "");
  /** The next token a lex of the whole document gives, as `nextLuauToken` gives it. */
  const fresh = (from: number, source: string) => {
    const token = lexLuauDocumentForTesting(source).find((candidate) => candidate.from >= from);
    if (!token) return null;
    return { text: token.kind === "name" || token.kind === "keyword" ? token.text : token.text[0], from: token.from };
  };

  test("an edit far into a long interpolation", () => {
    const before = "local s = `a {" + "x + ".repeat(40) + "x} b`\n";
    forget();
    nextLuauToken(before.length, before);
    const at = before.lastIndexOf("x}");
    const after = before.slice(0, at) + "y" + before.slice(at + 1);
    noteLuauDocumentEdit(before, after, at, at + 1, at + 1);
    expect(nextLuauToken(at + 3, after)).toEqual(fresh(at + 3, after));
    const cached = readLuauExpressionAfter(10, after);
    forget();
    expect(cached).toEqual(readLuauExpressionAfter(10, after));
    expect(cached.errors).toEqual([]);
  });

  test("an edit after a backtick string's \\z escape and the lines it skips (round 1)", () => {
    const before = "local s = `a \\z\n" + " ".repeat(160) + "x b`\n";
    forget();
    nextLuauToken(before.length, before);
    const at = before.indexOf("x b");
    const after = before.slice(0, at) + "{x}" + before.slice(at + 1);
    noteLuauDocumentEdit(before, after, at, at + 1, at + 3);
    const cached = { next: nextLuauToken(15, after), expression: readLuauExpressionAfter(10, after) };
    forget();
    expect(cached).toEqual({ next: fresh(15, after), expression: readLuauExpressionAfter(10, after) });
    expect(cached.expression.errors).toEqual([]);
  });

  test("a chain of edits in and around interpolations", () => {
    let seed = 1451;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const pieces = ["`", "{", "}", "{ ", " }", "\n", " ", "x", "1", "+", "`a {", "} b {", "} c`", "{1}", "--", "\\", "\\z", " ".repeat(70), "\\u{41}"];
    let source = Array.from({ length: 30 }, (_, i) =>
      i % 3 === 0 ? `local v${i} = \`a {${"x + ".repeat(20)}{ y = ${i} }} b {z} c\`\n` : i % 3 === 1 ? `f(\`a {g(\`b {${i}} c\`)} d\`)\n` : `-- ${"note ".repeat(16)}${i}\n`).join("");
    forget();
    for (let step = 0; step < 150; step++) {
      const at = random(source.length + 1);
      const removed = random(4) === 0 ? random(8) : 0;
      const inserted = random(3) === 0 ? "" : pieces[random(pieces.length)]!;
      const before = source;
      source = source.slice(0, at) + inserted + source.slice(at + removed);
      noteLuauDocumentEdit(before, source, at, Math.min(at + removed, before.length), at + inserted.length);
      const probes = Array.from({ length: 4 }, (_, i) => i % 2 === 0 ? Math.min(source.length, at + random(80)) : random(source.length + 1));
      const found = { tokens: probes.map((from) => nextLuauToken(from, source)), expression: readLuauExpressionAfter(probes[0]!, source) };
      const tokens = probes.map((from) => fresh(from, source));
      forget();
      expect(found, `step ${step}`).toEqual({ tokens, expression: readLuauExpressionAfter(probes[0]!, source) });
      // Carry the lookups' tokens on from this document, as an editing session does.
      nextLuauToken(source.length, source);
    }
  });
});
