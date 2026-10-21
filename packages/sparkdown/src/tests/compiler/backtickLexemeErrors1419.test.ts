// A backtick string with interpolations that an expectation rejects is
// described and ranged as Luau's lexer reads it, its first lexeme
// (`` `a { ``), and read on lexeme by lexeme (I-1419); an empty
// interpolation reports Luau's one error at the string's opening section
// (I-1420); and an unfinished string's last section after a stray
// interpolation token is Luau's malformed-string lexeme (I-1421). Each
// form reports every error Luau's parser reports, once each, in Luau's
// words at Luau's range.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const SCENE = "scene start\n  Hello.\nend\n";

/** Sparkdown's syntax errors, as `start-end message` in 0-based lines and characters, in position order. */
function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

/** The official parser's errors for `text`, moved down by `line` lines and right by `shift` characters. */
function official(text: string, line = 0, shift = 0): string[] {
  return officialErrorList(text)
    .map((error) =>
      error.replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + line}:${+sc + shift}-${+el + line}:${+ec + shift}`),
    )
    .sort();
}

describe("a rejected backtick string is read as Luau's lexemes (I-1419)", () => {
  // Unindented, since an error naming a bracket gives its column.
  const bodies = [
    "`a {x} b`",
    "local t = (1 `a {x} b`)",
    "`a {x} b {y} c`",
    "local t = (1 `a {x} b {y} c`)",
    "local t = g(1 `a {x} b`)",
    "local t = {1 `a {x} b`}",
    "local t = 1 `a {x} b`",
    "x = 1 `a {x} b`",
    // Read as one string again where an expression begins at its first lexeme.
    "for i `a {x} b` do end",
    "local x: `a {x} b` = 1",
    "g `a {x} b`",
    "local t = (`a {x} b` `c {y} d`)",
    // An empty interpolation, or no closing backtick, in a string the
    // statement rejects before reading it (round 1).
    "`a {} b`",
    "local t = (1 `a {} b`)",
    "`a {x} b",
    "`a {x} b {y} c",
    "local t = (1 `a {x} b)",
  ];
  for (const body of bodies) {
    test(`a function's ${body}`, () => {
      const luau = `function f()\n${body}\nend\n`;
      const expected = official(luau);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`${luau}Go {f()}.\n`)).toEqual(expected);
    });
  }

  test("the ticket's reproduction", () => {
    expect(sparkdownErrors("function f()\n`a {x} b`\nend\nGo {f()}.\n")).toEqual(
      [
        "1:0-1:4 Expected identifier when parsing expression, got `a {",
        "1:4-1:5 Incomplete statement: expected assignment or a function call",
        "1:5-1:9 Expected identifier when parsing expression, got } b`",
      ].sort(),
    );
    expect(sparkdownErrors("function f()\nlocal t = (1 `a {x} b`)\nend\nGo {f()}.\n")).toEqual(
      [
        "1:13-1:17 Expected ')' (to close '(' at column 11), got `a {",
        "1:17-1:18 Incomplete statement: expected assignment or a function call",
        "1:18-1:22 Expected identifier when parsing expression, got } b`",
        "1:22-1:23 Expected identifier when parsing expression, got ')'",
      ].sort(),
    );
  });
});

/** The forms of `s = <value>` as a story `store`, a scene-level `local` and a function's `local`, with Luau's errors for each. */
function placements(rest: string): [string, string, string[]][] {
  const luau = `local ${rest}\n`;
  return [
    ["store", `store ${rest}\n${SCENE}`, official(luau)],
    ["store alone", `store ${rest}\n`, official(luau)],
    // Indented as written, since an error naming a bracket gives its column.
    // A blank line stands for the scene's header, so a message naming a line names the document's.
    ["a scene-level local", `scene start\n  local ${rest}\n  Hello.\nend\n`, official(`\n  ${luau}`)],
    ["a function's local", `function f()\n  local ${rest}\n  return s\nend\n`, official(`function f()\n  ${luau}  return s\nend\n`)],
  ];
}

describe("a rejected backtick string in a story statement is read as Luau's lexemes (I-1419)", () => {
  // On a line of its own, the string still follows the expression it
  // cannot continue (round 2).
  for (const rest of ["s = (1 `a {x} b`)", "s = {1 `a {x} b`}", "s = (1 `a {} b`)", "s = (1\n  `a {} b`)", "s = {1,\n  2 `a {} b`}", "s = (\n  `a {} b`)"]) {
    for (const [form, text, expected] of placements(rest)) {
      test(`${form} ${rest}`, () => {
        expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(text)).toEqual(expected);
      });
    }
  }
});

describe("an empty interpolation reports Luau's error at the string's opening section (I-1420)", () => {
  for (const rest of ["s = `a {} b`", "s = `{}`", "s = `a {x} b {} c`", "s = `a {} b {} c`", "s = `a {} b {c} d`", "s = `a {} b {1 2} c`", "s = `a {} b", "s = `a {} b {c} d"]) {
    for (const [form, text, expected] of placements(rest)) {
      test(`${form} ${rest}`, () => {
        expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(text)).toEqual(expected);
      });
    }
  }

  test("the ticket's reproduction", () => {
    const message = "Malformed interpolated string, expected expression inside '{}'";
    expect(official("local s = `a {} b`\n")).toEqual([`0:10-0:14 ${message}`]);
    expect(sparkdownErrors(`store s = \`a {} b\`\n${SCENE}`)).toEqual([`0:10-0:14 ${message}`]);
    expect(sparkdownErrors(`scene start\n  local s = \`a {} b\`\n  Hello.\nend\n`)).toEqual([`1:12-1:16 ${message}`]);
    expect(sparkdownErrors(`function f()\n  local s = \`a {} b\`\n  return s\nend\n${SCENE}`)).toEqual([`1:12-1:16 ${message}`]);
  });

  // A double-quoted string's interpolation is Sparkdown's own syntax.
  test("a double-quoted string's {} is Sparkdown's own", () => {
    expect(sparkdownErrors(`store s = "a {} b"\n${SCENE}`).filter((e) => /expected expression inside/.test(e))).toHaveLength(1);
  });
});

describe("an unfinished string's last section after a stray token is a malformed string (I-1421)", () => {
  test("store s = `a {1 2} b", () => {
    const expected = official("local s = `a {1 2} b\n");
    expect(expected).toContain("0:17-0:20 Expected identifier when parsing expression, got malformed string");
    expect(sparkdownErrors("store s = `a {1 2} b\n")).toEqual(expected);
  });
  for (const rest of ["s = `a {1 2} b", "s = `a {1 2} b {c} d"]) {
    test(`store ${rest}`, () => {
      expect(sparkdownErrors(`store ${rest}\n`)).toEqual(official(`local ${rest}\n`));
    });
    test(`a scene-level local ${rest}`, () => {
      expect(sparkdownErrors(`scene start\n  local ${rest}\n  Hello.\nend\n`)).toEqual(official(`local ${rest}\n`, 1, 2));
    });
    test(`a function's local ${rest}`, () => {
      const luau = `function f()\n  local ${rest}\n  return s\nend\n`;
      expect(sparkdownErrors(luau)).toEqual(official(luau));
    });
  }
  // The open interpolation's form already matches; it keeps matching.
  test("store s = `a {1 2} b {c", () => {
    expect(sparkdownErrors("store s = `a {1 2} b {c\n")).toEqual(official("local s = `a {1 2} b {c\n"));
  });
  test("a function's local s = `a {1 2} b {c", () => {
    expect(sparkdownErrors("function f()\n  local s = `a {1 2} b {c\n")).toEqual(official("function f()\n  local s = `a {1 2} b {c\n"));
  });
});
