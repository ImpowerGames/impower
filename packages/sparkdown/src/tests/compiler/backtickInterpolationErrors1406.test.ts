// A backtick string whose interpolation holds a second token after its
// expression (`` `a {1 2} b` ``) reports every error Luau's parser reports
// for the line, once each, in Luau's words at Luau's range, in a story
// `store` and in a scene-level `local` (I-1406, after I-1370).
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

/** The official parser's errors for `local <rest>`, moved to line `line` and right by `shift` characters. */
function official(rest: string, line: number, shift: number): string[] {
  return officialErrorList(`local ${rest}\n`)
    .map((error) =>
      error.replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + line}:${+sc + shift}-${+el + line}:${+ec + shift}`),
    )
    .sort();
}

describe("a backtick string's malformed interpolation reports Luau's errors (I-1406)", () => {
  const values = [
    "s = `a {1 2} b`",
    "s = `{1 2}`",
    "s = `a {x y} b`",
    "s = `a {1 2 3} b`",
    "s = `a {f() g} b`",
    "s = `a {1 + 2 3} b`",
    // The sections and interpolations after the one Luau gives up on.
    "s = `a {1 2} b {c} d`",
    "s = `{c} a {1 2} b {d 3} e`",
  ];
  for (const rest of values) {
    test(`store ${rest}`, () => {
      const expected = official(rest, 0, 0);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`store ${rest}\n${SCENE}`)).toEqual(expected);
      expect(sparkdownErrors(`store ${rest}\n`)).toEqual(expected);
    });
    test(`a scene-level local ${rest}`, () => {
      const expected = official(rest, 1, 2);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`scene start\n  local ${rest}\n  Hello.\nend\n`)).toEqual(expected);
    });
    test(`a function's local ${rest}`, () => {
      const expected = official(rest, 1, 2);
      expect(sparkdownErrors(`function f()\n  local ${rest}\n  return s\nend\n`)).toEqual(expected);
    });
  }

  // A double-quoted string's interpolation is Sparkdown's own syntax.
  test("a double-quoted string's interpolation is unchanged", () => {
    expect(sparkdownErrors(`store s = "a {1 2} b"\n${SCENE}`)).toEqual([]);
  });

  test("the ticket's reproduction", () => {
    const luau = [
      "0:10-0:14 Malformed interpolated string, got '2'",
      "0:16-0:17 Expected identifier when parsing expression, got '2'",
      "0:17-0:21 Expected identifier when parsing expression, got } b`",
    ];
    expect(official("s = `a {1 2} b`", 0, 0)).toEqual([...luau].sort());
    expect(sparkdownErrors(`store s = \`a {1 2} b\`\n${SCENE}`)).toEqual([...luau].sort());
  });
});
