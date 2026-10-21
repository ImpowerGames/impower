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
    // Quotes after the closing quote, in a string or a comment
    // (round 1, `ax` finding 1).
    ["{b", ' .. "c"'],
    ["{b", ' .. x) -- say "hello"'],
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
