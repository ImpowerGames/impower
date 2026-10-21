// Where an interpolation left open ends (I-1342, I-1343). Each form stands
// in a function in a `.sd` document with a story line after it. The tree
// holds no `ERROR_INCOMPLETE`, the function ends at its own `end`, and the
// story line is read as it is without the form.
//
// I-1342: a `"` string's interpolation left open ends at the string's
// closing quote, which no call (`b"`) or operation (`c .. "`) in it takes as
// the opening of a string of its own, so the only errors are the
// interpolation's. `"..."` interpolation is Sparkdown's, so the official
// parser has no reading of it to compare.
//
// I-1343: a backtick string's interpolation left open ends at a line that
// cannot go on with its expression, where Luau's parser stops reading it,
// so Sparkdown's syntax errors are the official parser's, message and range.
import { describe, expect, test } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const HEADER = "function run()\n  ";
const FOOTER = "\nend\n";
const STORY = "After {run()}.\n";
const B = "`";

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
      // The converter's own report of the same interpolation, in Luau's
      // words, is left aside: it reports every unclosed `"` interpolation
      // on the base too (`"a {(b)"`), which this change does not touch.
      expect(sparkdownErrors(text).filter((e) => !e.endsWith("did you forget to add a '}'?"))).toEqual([`1:${from}-1:${to} Malformed interpolated string; did you forget to add a \`}\`?`]);
    });
  }

  test("an interpolation closed before a `\"` string in it keeps the string", () => {
    expect(sparkdownErrors(documentOf('g("a {c .. "x"} y")').text)).toEqual([]);
    expect(sparkdownErrors(documentOf('g("a {f"x"} y")').text)).toEqual([]);
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

describe("a backtick string's interpolation left open ends at a line that cannot go on with its expression (I-1343)", () => {
  const forms: [string, string][] = [
    // The ticket's form, and its variants: the token after the interpolation
    // is the next line's, which Luau's parser reads after the string.
    ["the next line's statement", `f(${B}a {b\n  x = 1`],
    ["two statements after it", `f(${B}a {b\n  x = 1\n  y = 2`],
    ["a comma that goes on with the call", `f(${B}a {b\n  , 2)`],
    ["a statement after a `local`", `local s = ${B}a {b\n  x = 1`],
    ["an interpolation after a closed one", `local s = ${B}a {b} c {d\n  x = 1`],
    ["an interpolation whose `{` ends its line", `local s = ${B}a {\n  b\n  x = 1`],
    // A line that holds the interpolation's `}`: Luau's lexer reads the
    // string on from it.
    ["the `}` on the next line", `f(${B}a {b\n  x}${B})`],
    ["the `}` after a table", `f(${B}a {b\n  x = {1}}${B})`],
    ["the `}` after an expression whose `{` ends its line", `local s = ${B}a {\n  b\n  x}${B}`],
    ["a call that may be a new statement", `f(${B}a {b\n  (c)}${B})`],
    // Lines that go on with the expression.
    ["a member", `f(${B}a {b\n  .c}${B})`],
    ["a binary operator", `f(${B}a {b\n  + c}${B})`],
    ["a comparison", `f(${B}a {b\n  == c}${B})`],
    ["an operator that ends a line", `f(${B}a {b +\n  c}${B})`],
    ["a blank line and a comment line before an operator", `f(${B}a {b\n\n  -- note\n  .. c}${B})`],
    ["an if-expression's `then`", `local s = ${B}a {if a\n  then b\n  else c}${B}`],
    ["a call's arguments", `local s = ${B}a {f(\n  1\n  )}${B}`],
    ["an indexer", `local s = ${B}a {t[\n  1\n  ]}${B}`],
    ["a cast", `local s = ${B}a {x ::\n  number\n  }${B}`],
    ["a logical operator", `local s = ${B}a {a and\n  b\n  }${B}`],
    ["a unary operator", `local s = ${B}a {not\n  b\n  }${B}`],
    ["a function", `local s = ${B}a {(function()\n  return 1\n  end)()}${B}`],
    ["the `}` alone", `f(${B}a {b\n  }${B})`],
    ["an expression after a `{` that ends its line", `f(${B}a {\n  b\n  }${B})`],
    ["an unindented expression after a `{` that ends its line", `f(${B}a {\nb}${B})`],
    ["a block comment closed after the `{`", `local s = ${B}a { --[[x]] 1 }${B}`],
    ["a line comment after the `{`", `local s = ${B}a { -- x\n  1 }${B}`],
  ];
  for (const [name, form] of forms) {
    test(`${name}: ${JSON.stringify(form)}`, () => {
      const { luau, text } = documentOf(form);
      expect(sparkdownErrors(text)).toEqual(officialErrorList(luau).sort());
    });
  }

  test("the ticket's form reports Luau's two errors", () => {
    const { luau, text } = documentOf(`f(${B}a {b\n  x = 1`);
    const expected = ["1:4-1:8 Malformed interpolated string, got 'x'", "2:2-2:3 Expected ')' (to close '(' at line 2), got 'x'"];
    expect(officialErrorList(luau).sort()).toEqual(expected);
    expect(sparkdownErrors(text)).toEqual(expected);
  });
});
