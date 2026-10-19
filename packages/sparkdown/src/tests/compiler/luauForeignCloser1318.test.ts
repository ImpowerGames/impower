// A Luau construct yields at a closer it does not own, and a quoted or
// interpolated string ends at its line (I-1318, closing I-1286, I-1289,
// I-1290, I-1295 and I-1296). Each form stands in a function in a `.sd`
// document with a story line after it. The tree holds no `ERROR_INCOMPLETE`,
// the function ends at its own `end`, the story line is read as it is without
// the form, and Sparkdown's syntax errors are the official parser's, message
// and range, for the Luau of the function.
import { describe, expect, test } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialSyntaxErrors } from "./officialSyntax";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const HEADER = "function run()\n  ";
const FOOTER = "\nend\n";
const STORY = "After {run()}.\n";

interface Form {
  /** The lines in the function, the first indented by the header. */
  form: string;
  /**
   * Sparkdown's syntax errors, each one of the official parser's, at its
   * range unless `range` says otherwise, or `"official"` for every one of
   * the official parser's errors, each at its range.
   */
  errors: string[] | "official";
  /** A range Sparkdown gives on purpose that differs from the official parser's, by message. */
  range?: Record<string, string>;
}

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

/** The official parser's errors for the function's Luau, in the same form. */
function luauErrors(luau: string): string[] {
  return officialSyntaxErrors(luau).map((e) => `${e.location.begin.line}:${e.location.begin.column}-${e.location.end.line}:${e.location.end.column} ${e.message}`);
}

/** The name of the top-level node a document offset lies in. */
function topLevelAt(text: string, offset: number): SyntaxNode | null {
  let node = parseSource(text).topNode.firstChild;
  while (node && node.to <= offset) node = node.nextSibling;
  return node;
}

function expectForm({ form, errors, range = {} }: Form): void {
  const luau = `${HEADER}${form}${FOOTER}`;
  const text = `${luau}${STORY}`;
  const tree = stripAnsi(dumpTree(text));
  expect(tree, tree).not.toContain("ERROR_INCOMPLETE");

  const fn = parseSource(text).topNode.firstChild!;
  expect(fn.name).toBe("LuauFunctionDefinition");
  expect([fn.from, fn.to], "the function ends at its own `end`").toEqual([0, luau.length - 1]);

  const story = topLevelAt(text, luau.length);
  const control = topLevelAt(`${HEADER}x = 1${FOOTER}${STORY}`, `${HEADER}x = 1${FOOTER}`.length);
  expect([story?.name, story?.from], "the line after the function is read as it is after a function without the form").toEqual([control?.name, luau.length]);

  const official = luauErrors(luau);
  if (errors === "official") {
    expect(official.length, "the official parser reports the form").toBeGreaterThan(0);
    expect(sparkdownErrors(text)).toEqual([...official].sort());
    return;
  }
  const expected = errors.map((message) => {
    const found = official.find((e) => e.slice(e.indexOf(" ") + 1) === message);
    expect(found, `the official parser reports ${JSON.stringify(message)}:\n${official.join("\n")}`).toBeDefined();
    return range[message] ? `${range[message]} ${message}` : found!;
  });
  expect(sparkdownErrors(text)).toEqual(expected.sort());
}

const CASES: Record<string, Form[]> = {
  // A parenthesis left open in a function (I-1286). Luau reports a token
  // once, with its first error (`Expected identifier when parsing
  // expression, got '::'` is at the token of `Assigned expression`), and a
  // missing type's range ends with the line it is missing from.
  "an unclosed parenthesis": [
    {
      form: "(::,",
      errors: ["Assigned expression must be a variable or a field", "Expected type, got ','", "Expected identifier when parsing expression, got 'end'"],
    },
    {
      form: "(::",
      errors: ["Expected identifier when parsing expression, got '::'", "Expected type, got 'end'", "Expected ')' (to close '(' at line 2), got 'end'"],
      range: { "Expected type, got 'end'": "1:5-2:0" },
    },
    {
      form: "(1,",
      errors: ["Assigned expression must be a variable or a field", "Expected ')' (to close '(' at column 3), got ','", "Expected identifier when parsing expression, got 'end'"],
    },
  ],
  // A `;` right after a `repeat` loop's `until` condition (I-1289).
  "a semicolon after an until condition": [
    { form: "local x = 0\n  repeat x = x + 1 until x >= 3;", errors: [] },
    { form: "repeat until 1; repeat until true;", errors: [] },
  ],
  // A method name that is a reserved word (I-1290), reported with Luau's
  // first error, at the word. A `do` that a loop's header holds after a `:`
  // left without a name still opens the loop's block, which takes the `end`
  // after it as Luau's loop does (round 1, `undirected` finding 2).
  "a keyword as a method name": [
    { form: "local a = {}\n  local b = a:do", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local a = {}\n  local b = a:end", errors: ["Expected identifier when parsing method name, got 'end'"] },
    { form: "local a = {}\n  a:function()", errors: ["Expected identifier when parsing method name, got 'function'"] },
    { form: "local a = {}\n  a:do()", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  while t: do end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  if t: then end", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local t = {}\n  for k, v in t: do end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    // The header's `do` ends its line, and code follows the loop (round 2,
    // `ax` finding 1).
    { form: "local t = {}\n  while t: do\n    t:done()\n  end\n  return 7", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  for k, v in t: do\n    print(k)\n  end\n  return 7", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  if t: then\n    print(t)\n  end\n  return 7", errors: ["Expected identifier when parsing method name, got 'then'"] },
    // Spaces, tabs or a block comment between the `:` and the keyword, and
    // `then` in a statement (round 2, `undirected` findings 1 and 3).
    { form: "local a = {}\n  local b = a:  do", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local a = {}\n  local b = a:\t\tdo", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local a = {}\n  local b = a: --[[x]] do", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local a = {}\n  a:  do()", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local a = {}\n  local b = a:then", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local a = {}\n  local b = a:  then", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local a = {}\n  a:then()", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local a = {}\n  local b = a: --[[x]] end", errors: ["Expected identifier when parsing method name, got 'end'"] },
    { form: "local t = {}\n  while t:  do\n    print(t)\n  end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  while t: --[[x]] do end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  while t:do end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  if t:then end", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local t = {}\n  if t.a:  then\n    print(t)\n  end", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local t = {}\n  if t.a then\n    print(t)\n  elseif t:then\n  end", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local t = {}\n  for i = 1, t:  do end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  local x = if t: then 1 else 2", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local t = {}\n  local x = if t:then 1 else 2", errors: ["Expected identifier when parsing method name, got 'then'"] },
    // The `:` after an operator's operand, and after a value in brackets.
    { form: "local t = {}\n  while not t: do\n    print(t)\n  end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  while t.a and t: do\n    print(t)\n  end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  if 1 + t: then\n    print(t)\n  end", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local t = {}\n  while (t): do\n    print(t)\n  end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  local b = x and t: do", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  local c = 1 + t:then", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local t = {}\n  (t):do()", errors: ["Expected identifier when parsing method name, got 'do'"] },
    // A `for` loop variable's `:` is its type's (round 3 CI).
    { form: "for k: do end", errors: ["Expected type, got 'do'"] },
    { form: "for k, v: in pairs({}) do end", errors: ["Expected type, got 'in'"] },
    { form: "for k: then do end", errors: ["Expected type, got 'then'"] },
    { form: "local t = {}\n  for k in t: then do end", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local t = {}\n  local b = (t): --[[c]] then", errors: ["Expected identifier when parsing method name, got 'then'"] },
    // The other header's keyword in a condition is the method's name (round
    // 3, `ax` finding 1).
    { form: "local t = {}\n  if t:do() then\n    return 1\n  end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  if t:  do then\n    return 1\n  end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  if t.a then\n    return 1\n  elseif t:do() then\n    return 2\n  end", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  local x = if t:do() then 1 else 2", errors: ["Expected identifier when parsing method name, got 'do'"] },
    { form: "local t = {}\n  while t:then() do\n    print(t)\n  end", errors: ["Expected identifier when parsing method name, got 'then'"] },
    { form: "local t = {}\n  for k, v in t:then() do\n    print(k)\n  end", errors: ["Expected identifier when parsing method name, got 'then'"] },
  ],
  // A loop left without its `do` or `until` before the function's `end`
  // (I-1295). Luau's reading then closes the loop at that `end` and reports
  // the function left open at the end of the input; the function keeps its
  // `end`, so only the loop's error is reported.
  "a loop without its do or until": [
    { form: "while true", errors: ["Expected 'do' when parsing while loop, got 'end'"] },
    { form: "while true d", errors: ["Expected 'do' when parsing while loop, got 'd'"] },
    { form: "while t", errors: ["Expected 'do' when parsing while loop, got 'end'"] },
    { form: "while true\n  x = 1", errors: ["Expected 'do' when parsing while loop, got 'x'"] },
    { form: "for x", errors: ["Expected 'in' when parsing for loop, got 'end'"] },
    { form: "for x in t", errors: ["Expected 'do' when parsing for loop, got 'end'"] },
    {
      form: "repeat\n  t:",
      errors: ["Expected '(', '{' or <string> when parsing function call, got 'end'", "Expected identifier when parsing method name, got 'end'"],
    },
    { form: "repeat\n  x = 1", errors: ["Expected 'until' (to close 'repeat' at line 2), got 'end'"] },
    { form: "repeat\n  t", errors: ["Incomplete statement: expected assignment or a function call", "Expected 'until' (to close 'repeat' at line 2), got 'end'"] },
    { form: "repeat\n  t.", errors: ["Expected identifier, got 'end'"] },
    { form: "repeat\n  local", errors: ["Expected identifier when parsing variable name, got 'end'"] },
  ],
  // A string or interpolated string left open on its line (I-1296).
  "a string left open on its line": [
    {
      form: "f(`expression = {--[[ bla bla bla ]]`)",
      errors: ["Malformed interpolated string; did you forget to add a '`'?", "Expected ')' (to close '(' at line 2), got 'end'"],
    },
    { form: 'local x: "a = 1\n  f(x)', errors: ["Malformed string; did you forget to finish it?"] },
    { form: "local s = 'open\n  f(s)", errors: ["Malformed string; did you forget to finish it?"] },
    { form: "local s = `open\n  f(s)", errors: ["Malformed string; did you forget to finish it?"] },
    {
      form: "f(`a {b`)",
      errors: ["Malformed interpolated string; did you forget to add a '}'?", "Expected ')' (to close '(' at line 2), got 'end'"],
    },
    {
      form: "f(`a {b} c)",
      errors: ["Malformed interpolated string; did you forget to add a '`'?", "Expected ')' (to close '(' at line 2), got 'end'"],
    },
  ],
  // A bracket ends before a bracket closer of another kind, which the
  // bracket around it takes.
  "a bracket closer a bracket did not open": [
    { form: "local t = { g(1 }", errors: ["Expected ')' (to close '(' at column 16), got '}'"] },
    { form: "local t = ( { 1 )", errors: ["Expected '}' (to close '{' at column 15), got ')'"] },
    { form: "local t = a[1 }", errors: ["Expected ']' (to close '[' at column 14), got '}'"] },
    { form: "local t = { 1 ) }", errors: ["Expected '}' (to close '{' at column 13), got ')'"] },
    { form: "local x: (number] = 1", errors: ["Expected ')' (to close '(' at column 12), got ']'"] },
    { form: "local x: {a: number) = 1", errors: ["Expected '}' (to close '{' at column 12), got ')'"] },
  ],
  // A `\` or a `\z` that ends its line carries the string on, so a closer
  // that begins the next line is text (round 1, finding 1), and a string in
  // an interpolation that goes on over lines is the interpolation's
  // expression (finding 2).
  "a string a line continuation carries on": [
    { form: "local s = `a\\\nend`", errors: [] },
    { form: "local s = `a\\z\nend`", errors: [] },
    { form: "local s = `a\\\n)`", errors: [] },
    { form: 'local s = "a\\\nend"', errors: [] },
    { form: "local s = 'a\\z\n\n  end'", errors: [] },
    { form: 'local s = `a {"b\\z\n  c"} d`', errors: [] },
    { form: "local s = `a {'b\\z\n  c'} d`", errors: [] },
    { form: "local s = `a {`b\\z\n  c`} d`", errors: [] },
    { form: "local s = `a {`b {1 +\n  2} c`} d`", errors: [] },
    // A `}` in a long string or a comment closes no interpolation
    // (round 1, `undirected` finding 1).
    { form: "local s = `a {`b {[[}\nx]]} c`} d`", errors: [] },
    { form: "local s = `a {`b {--[[}\nx]] 1} c`} d`", errors: [] },
    // Nor does a `}` in a quoted string (round 2, `undirected` finding 2).
    { form: 'local s = `a {`b {"}" ..\n  "x"} c`} d`', errors: [] },
    { form: "local s = `a {`b {'}' ..\n  'x'} c`} d`", errors: [] },
    { form: 'local s = `a {"}" ..\n  "x"} d`', errors: [] },
    { form: "local s = `a {`b {`}`} c` ..\n  `x`} d`", errors: [] },
  ],
  // An interpolation that ends with a string its line ends inside is left
  // open, whatever that string holds (finding 3).
  "an interpolation that ends with a string left open": [
    { form: 'local s = `a {"y}', errors: "official" },
    { form: 'local s = `a {1 "y}', errors: "official" },
    { form: "local s = `a {1 `y}", errors: "official" },
  ],
  // The forms that were read correctly keep their reading.
  "well-formed code": [
    { form: "if x then x = 1 end;", errors: [] },
    { form: "local x = 0\n  while x < 3 do x = x + 1 end;", errors: [] },
    { form: 'g("ok")', errors: [] },
    { form: "x = 1; g();", errors: [] },
    { form: "local function h() end; do end; for i = 1, 2 do end;", errors: [] },
    { form: "local x = `a {g()} b`", errors: [] },
    { form: "local x = `a {`b`} c`", errors: [] },
    { form: "local x = `a {g\n  }`", errors: [] },
    { form: 'local x = "a\\z\n  b"', errors: [] },
    { form: 'local x = "a\\\n  b"', errors: [] },
  ],
};

describe("a Luau construct yields at a closer it does not own (I-1318)", () => {
  for (const [name, forms] of Object.entries(CASES)) {
    describe(name, () => {
      for (const form of forms) {
        test(JSON.stringify(form.form), () => expectForm(form));
      }
    });
  }

  // A bracket ends before a bracket closer it did not open, so the statement
  // or condition around it ends there too, and the body reads the closer.
  for (const form of [
    "return f(1 ]",
    "print(a) ]",
    "x.y = {1 )",
    "local t = {a = f(1 ], b = 2}",
    "local x = y :: {a: number )",
    "if (a ] then end",
    "while (a } do end",
    "for i = (1 ], 2 do end",
    "for k, v in pairs(t ] do end",
    "repeat until (x ]",
    "local x = if a then (1 ] else 2",
    "local function g(a ] end",
    "type F = (a: number ] -> ()",
  ]) {
    test(`a stray closer in ${JSON.stringify(form)} leaves the tree whole`, () => {
      const luau = `${HEADER}${form}${FOOTER}`;
      const text = `${luau}${STORY}`;
      expect(stripAnsi(dumpTree(text))).not.toContain("ERROR_INCOMPLETE");
      const fn = parseSource(text).topNode.firstChild!;
      expect([fn.name, fn.from, fn.to]).toEqual(["LuauFunctionDefinition", 0, luau.length - 1]);
      expect(luauErrors(luau).length, "the official parser reports the closer").toBeGreaterThan(0);
    });
  }

  // The same at story scope: a story condition, a marked statement, a
  // declaration and Sparkdown's interpolations end before a bracket closer a
  // bracket in them did not open, and the story line after them is its own.
  for (const story of [
    "& x = (1 ]",
    "store x = (1 ]",
    "if (a ] then\n  Hi.\nend",
    "if a then\n  Hi.\nelseif (b ] then\n  Ho.\nend",
    "while (a } do\n  Hi.\nend",
    "repeat\n  Hi.\nuntil (x ]",
    "& if (a ] then end",
    "Value {(1 ]}.",
    "Value {{f(1 ]}}.",
    'store s = "a {(1 ]} b"',
  ]) {
    test(`a stray closer in the story ${JSON.stringify(story)} leaves the next line its own`, () => {
      const text = `${story}\nAfter.\n`;
      expect(stripAnsi(dumpTree(text))).not.toContain("ERROR_INCOMPLETE");
      expect(topLevelAt(text, text.indexOf("After."))?.from).toBe(text.indexOf("After."));
    });
  }

  // A loop whose `do` block takes the function's `end` leaves the function
  // open, as Luau reports it, so the function runs to the end of the input.
  test("a `do` block that takes the function's `end` leaves the function open", () => {
    const luau = `${HEADER}while true do${FOOTER}`;
    const text = `${luau}${STORY}`;
    expect(stripAnsi(dumpTree(text))).not.toContain("ERROR_INCOMPLETE");
    expect(parseSource(text).topNode.firstChild!.to).toBe(text.length);
    expect(luauErrors(luau).map((e) => e.slice(e.indexOf(" ") + 1))).toEqual(["Expected 'end' (to close 'function' at line 1), got <eof>; did you forget to close 'do' at line 2?"]);
  });
});
