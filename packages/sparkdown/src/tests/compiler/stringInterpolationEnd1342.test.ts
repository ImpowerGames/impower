// Where a double-quoted string's interpolation left open ends (I-1342).
// Each form stands in a function in a `.sd` document with a story line
// after it. The tree holds no `ERROR_INCOMPLETE`, the function ends at its
// own `end`, and the story line is read as it is without the form.
//
// I-1342: a `"` string's interpolation left open ends at the string's
// closing quote, which no call (`b"`) or operation (`c .. "`) in it takes as
// the opening of a string of its own, so the only errors are the
// interpolation's. `"..."` interpolation is Sparkdown's, so the official
// parser has no reading of it to compare.
import { describe, expect, test } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const HEADER = "function run()\n  ";
const FOOTER = "\nend\n";
const STORY = "After {run()}.\n";

/** Sparkdown's syntax errors, as `start-end message` in 0-based lines and characters. */
function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program;
  return (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

/** The top-level node a document offset lies in. */
function topLevelAt(text: string, offset: number): SyntaxNode | null {
  let node = parseSource(text).topNode.firstChild;
  while (node && node.to <= offset) node = node.nextSibling;
  return node;
}

/** The form's document, after checking that the function around it keeps its `end` and the story line after it. */
function documentOf(form: string): { luau: string; text: string } {
  const luau = `${HEADER}${form}${FOOTER}`;
  const text = `${luau}${STORY}`;
  const tree = stripAnsi(dumpTree(text));
  expect(tree, tree).not.toContain("ERROR_INCOMPLETE");
  const fn = parseSource(text).topNode.firstChild!;
  expect(fn.name).toBe("LuauFunctionDefinition");
  expect([fn.from, fn.to], "the function ends at its own `end`").toEqual([0, luau.length - 1]);
  const story = topLevelAt(text, luau.length);
  const control = topLevelAt(`${HEADER}x = 1${FOOTER}${STORY}`, `${HEADER}x = 1${FOOTER}`.length);
  expect([story?.name, story?.from], "the story line is read as it is after a function without the form").toEqual([control?.name, luau.length]);
  return { luau, text };
}

describe("a double-quoted string's interpolation left open ends at the string's closing quote (I-1342)", () => {
  // The interpolation's text, `{` to the closing quote, and what follows the
  // quote on its line, in `g("a ` ... `)`. The function's next line is
  // `return 1`, which stays the function's.
  for (const [interpolation, after] of [
    ["{b", " .. x"],
    ["{b ", " .. x"],
    ["{t.b", " .. x"],
    ["{f()", " .. x"],
    ["{f(1)", " .. x"],
    ["{c .. b", " .. x"],
    ["{c + b", " .. x"],
    ["{-b", " .. x"],
    ["{{b", " .. x"],
    // A `"` string in brackets is the expression's.
    ['{f("x")', " .. y"],
    ['{t["k"]', " .. y"],
  ] as const) {
    const form = `g("a ${interpolation}"${after}${after.includes(")") ? "" : ")"}\n  return 1`;
    test(JSON.stringify(form), () => {
      const { text } = documentOf(form);
      const from = 2 + form.indexOf("{");
      const to = from + interpolation.length;
      // The unclosed interpolation, at its text, is the only error: no
      // string runs on from the closing quote, and the call keeps its `)`.
      // The converter reports the same interpolation again, in Luau's words,
      // from the closing quote: it does so for every unclosed `"`
      // interpolation on the base too (`"a {(b)"`), and which of the two
      // reports stands is the one-owner question of I-1435, so the second
      // is checked here only for being that report and nothing else.
      const errors = sparkdownErrors(text);
      const converter = errors.filter((e) => e.endsWith("did you forget to add a '}'?"));
      expect(errors.filter((e) => !converter.includes(e))).toEqual([`1:${from}-1:${to} Malformed interpolated string; did you forget to add a \`}\`?`]);
      expect(converter.map((e) => e.split("-", 1)[0])).toEqual([`1:${to}`]);
    });
  }

  // A line with a `"` after the closing quote keeps the reading without the
  // rule, the base's: a valid nested string always has a later quote, so the
  // rule gives these up rather than guess which quote closes the string
  // (round 4, decision 96eb2328). The call loses its `)` and the next line
  // reports it, but the string still ends at its line (I-1318), the
  // function keeps its `end` and the story after it parses. Each list is
  // the base's, pinned as a documented divergence from I-1342's reading.
  test("a quote after the closing quote keeps the base's reading, bounded to its line", () => {
    const missingParen = "2:2-2:8 Expected ')' (to close '(' at line 2), got 'return'";
    const cases: [string, string[]][] = [
      ['g("a {b" .. "c")', ["1:4-1:18 Malformed string; did you forget to finish it?", "1:7-1:18 Malformed interpolated string; did you forget to add a `}`?", missingParen]],
      ['g("a {b", "c")', ["1:4-1:16 Malformed string; did you forget to finish it?", "1:7-1:16 Malformed interpolated string; did you forget to add a `}`?", missingParen]],
      ['g("a {b" .. x) -- say "hello"', ["1:30-1:31 Malformed string; did you forget to finish it?", "1:4-1:31 Malformed string; did you forget to finish it?", "1:7-1:31 Malformed interpolated string; did you forget to add a `}`?", missingParen]],
      ['g("a {b" .. x) -- say "hello', ["1:4-1:30 Malformed string; did you forget to finish it?", "1:7-1:30 Malformed interpolated string; did you forget to add a `}`?", missingParen]],
      ['g("a {b" .. x) -- "a" "b', ["1:4-1:26 Malformed string; did you forget to finish it?", "1:7-1:26 Malformed interpolated string; did you forget to add a `}`?", missingParen]],
      ['g("a {b" .. x) -- say "hello }"', ["1:25-1:30 Malformed interpolated string, got 'hello'", missingParen]],
    ];
    for (const [form, errors] of cases) {
      expect(sparkdownErrors(documentOf(`${form}\n  return 1`).text), form).toEqual(errors);
    }
  });

  test("an interpolation closed before a `\"` string in it keeps the string", () => {
    expect(sparkdownErrors(documentOf('g("a {c .. "x"} y")').text)).toEqual([]);
    expect(sparkdownErrors(documentOf('g("a {f"x"} y")').text)).toEqual([]);
    // A line the scan for the interpolation's `}` cannot read through: a
    // comment, a long string or braces two deep (round 1, `undirected`
    // finding 1).
    for (const form of [
      'local s = "a {tostring"x" --[[note]] } y"',
      'local s = "a {tostring"x" .. [[y]]} z"',
      'local s = "a {tostring"x" .. tostring({{1}})} y"',
      'local s = "a {if true then "x" else tostring({{1}})} y"',
      // A `"` string the expression goes on after, and a backtick string
      // with a quote in its interpolation (round 2, `undirected` finding 1).
      'local s = "a {if true then "x" else "y"} z"',
      'local c = 1\n  local s = "a {c == 1 and "x" or "y"} z"',
      'local c = "c"\n  local s = "a {c .. "x" .. c} z"',
      'local s = "a {`x {"`"} y`} z"',
      // Call sugar after a string, and a nested string with its own
      // interpolation (round 3, `ax` findings 1 and 2).
      'local f = function(s) return function(t) return s end end\n  local s = "a {f"x"{}} z"',
      'local f = function(s) return function(t) return s end end\n  local s = "a {f"x"\'y\'} z"',
      'local s = "a {tostring"x {tostring"y"}"} z"',
      // An anonymous function's body, and a block comment holding a brace
      // and a quote in a nested string's interpolation (round 3,
      // `undirected` findings 1 and 2).
      'local s = "a {function() return "x" end} z"',
      'local s = "a {function() local x = "x" return x end} z"',
      'local s = "a {function() local x = "x"; return x end} z"',
      'local s = "a {tostring"x {1 --[[ } "q" ]] } y"} z"',
    ]) {
      expect(sparkdownErrors(documentOf(form).text), form).toEqual([]);
    }
  });

  test("a closed interpolation's braces are its punctuation", () => {
    // Round 1, `ax` finding 2: the closing brace's capture stays with the
    // interpolation.
    const text = 'local s = "a {b} c"\n';
    const names = (at: number) => {
      const found: string[] = [];
      for (let node: SyntaxNode | null = parseSource(text).resolveInner(at, 1); node; node = node.parent) found.push(node.name);
      return found;
    };
    expect(names(text.indexOf("{"))).toContain("PunctuationBraceOpen");
    expect(names(text.indexOf("}"))).toContain("PunctuationBraceClose");
  });

  test("a store's value", () => {
    for (const value of ['"a {b"', '"a {x"', '"a {(x)"']) {
      const text = `store s = ${value}\n\n== A ==\nhello\n`;
      expect(sparkdownErrors(text)).toEqual([`0:13-0:${10 + value.length - 1} Malformed interpolated string; did you forget to add a \`}\`?`]);
    }
  });
});
