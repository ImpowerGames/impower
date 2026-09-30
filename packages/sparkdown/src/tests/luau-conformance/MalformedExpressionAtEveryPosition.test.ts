import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { parseLuau } from "../../compiler/typecheck/DefinitionParser";
import { diagnosticMessage } from "./diagnosticTestHarness";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

// An expression that is missing, or that cannot start with the token where
// one must stand, is one syntax error wherever an expression can appear,
// worded and placed as Luau's parser reports it: at the token Luau found
// instead (#1175). So is a member access with no name after its `.` or `:`,
// a named function where a value stands, and a statement that is a value
// but not a call. The enclosing function still ends at its own `end`.

/** Luau's first syntax error for a source, as `line:column-line:column message`. */
function luauFirstError(source: string): string[] {
  const error = parseLuau(source).errors[0];
  if (!error) return [];
  const { begin, end } = error.location;
  return [`${begin.line}:${begin.column}-${end.line}:${end.column} ${error.message}`];
}

const URI = "inmemory:///main.sd";

/** A `.sd` document's errors, as `line:character-line:character message`, and its functions' spans. */
function compileDocument(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const errors = (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1)
    .map((d) => `${d.range!.start.line}:${d.range!.start.character}-${d.range!.end.line}:${d.range!.end.character} ${diagnosticMessage(d)}`);
  return { errors, functions: program.pathLocations?.functions };
}

// Every position an expression can appear, with `E` where the expression
// goes and `F` where what follows it goes, and what can follow it there: the
// next statement on the next line, the block's `end`, `;`, a comment, an
// `until`, and the closing bracket or keyword of the position.
const POSITIONS: { name: string; template: string; followers: string[] }[] = [
  { name: "local value", template: "local y = E F", followers: ["\nlocal z = 2", "", ";", "-- note", "\nuntil"] },
  { name: "reassigned value", template: "y = E F", followers: ["\nlocal z = 2", "", ";"] },
  { name: "second local value", template: "local a, b = 1, E F", followers: ["\nlocal z = 2", "", ";"] },
  { name: "second reassigned value", template: "a, b = 1, E F", followers: ["\nlocal z = 2", ""] },
  { name: "return value", template: "return E F", followers: ["", ";"] },
  { name: "call argument", template: "print(E F", followers: [")"] },
  { name: "second call argument", template: "print(1, E F", followers: [")"] },
  { name: "parenthesized value", template: "local y = (E F", followers: [")"] },
  { name: "index", template: "local y = t[E F", followers: ["]"] },
  { name: "table field", template: "local y = { a = E F", followers: ["}", ", b = 2 }"] },
  { name: "if condition", template: "if E F", followers: ["then end"] },
  { name: "while condition", template: "while E F", followers: ["do end"] },
  { name: "statement", template: "E F", followers: ["\nlocal z = 2", "", ";"] },
];

// The malformed shapes an expression can take, and valid ones.
const SHAPES: { name: string; expression: string; valid?: true }[] = [
  { name: "nothing", expression: "" },
  { name: "a trailing +", expression: "1 +" },
  { name: "a trailing and", expression: "1 and" },
  { name: "a trailing ..", expression: "'a' .." },
  { name: "a trailing ==", expression: "1 ==" },
  { name: "a lone not", expression: "not" },
  { name: "a lone -", expression: "-" },
  { name: "a dangling .", expression: "t.a." },
  { name: "a dangling . after a parenthesized value", expression: "(t).a." },
  { name: "a dangling . after a call", expression: "get().a." },
  { name: "a dangling . after an index", expression: "t[1].a." },
  { name: "a dangling . after a comment", expression: "--[[c]] t.a." },
  { name: "a dangling :", expression: "t:" },
  { name: "a named function", expression: "function named() end" },
  { name: "a value", expression: "1 + 2", valid: true },
  { name: "a member", expression: "t.a", valid: true },
  { name: "a function", expression: "function() end", valid: true },
];

// A body as written by hand: one space between tokens where an empty shape
// leaves two, none at a line's end.
const tidy = (source: string) => source.replace(/(?<=\S) {2,}/g, " ").replace(/ +(?=\n|$)/g, "");

const cases: { position: string; shape: string; body: string }[] = [];
for (const { name, template, followers } of POSITIONS) {
  for (const follower of followers) {
    for (const shape of SHAPES) {
      // A line that begins with an operator continues the line before it in
      // Sparkdown, which reports one with nothing before it in its own words
      // (`LeadingDotContinuation.test.ts`), rather than Luau's (#1251).
      if (name === "statement" && shape.expression === "-") continue;
      let body = tidy(template.replace("E", shape.expression).replace("F", follower));
      if (follower === "\nuntil") body = `repeat\n${body} true`;
      cases.push({ position: name, shape: shape.name, body });
    }
  }
}

describe("a malformed expression at every position", () => {
  // In a function body, which is Luau code.
  test.each(cases.map((c) => [c.position, c.shape, c.body] as const))(
    "%s with %s: %j in a function reports Luau's first error",
    (_position, _shape, body) => {
      const lines = ["function f(t, get)", ...body.split("\n").map((line) => `  ${line}`), "end", ""];
      const text = lines.join("\n");
      const { errors, functions } = compileDocument(text);
      expect(errors).toEqual(luauFirstError(text));
      expect(functions).toEqual([{ path: "f", lines: [0, 0, lines.length - 2] }]);
    },
  );

  // In a Luau file, whose whole text is Luau.
  test.each(cases.map((c) => [c.position, c.shape, c.body] as const))(
    "%s with %s: %j in a Luau file reports Luau's first error",
    (_position, _shape, body) => {
      const source = `local t, get, a, b, y\n${body}\n`;
      const luau = luauFirstError(source).map((d) => d.replace(/^(\S+) /, "$1 SyntaxError: "));
      expect(checkLuau(source, { mode: "nonstrict" }).syntaxDiagnostics.map(describeDiagnostic)).toEqual(luau);
    },
  );
});

describe("the reported layouts", () => {
  // #1171: an operator at a line end before a line that cannot continue it.
  test.each([
    ["x = 1 +", ["2:0-2:3 Expected identifier when parsing expression, got 'end'"]],
    ["local y = 1 +\n  local z = 2", ["2:2-2:7 Expected identifier when parsing expression, got 'local'"]],
    ["local y = 1 +;", ["1:15-1:16 Expected identifier when parsing expression, got ';'"]],
    ["repeat\n    local y = 1 +\n  until true", ["3:2-3:7 Expected identifier when parsing expression, got 'until'"]],
    ["local y = not\n  return y", ["2:2-2:8 Expected identifier when parsing expression, got 'return'"]],
    // #1144: a value that is not a call, as a statement.
    ["2", ["1:2-1:3 Expected identifier when parsing expression, got '2'"]],
    ["x + 1", ["1:2-1:3 Incomplete statement: expected assignment or a function call"]],
    ["local a, b = 1\n    2", ["2:4-2:5 Expected identifier when parsing expression, got '2'"]],
    // #1148: a named function as a value.
    ["local a, g = 1, function named() return 7 end", ["1:27-1:32 Expected '(' when parsing function, got 'named'"]],
    ["a, g = 1, function named() return 7 end", ["1:21-1:26 Expected '(' when parsing function, got 'named'"]],
  ])("%j in a function reports %j", (body, messages) => {
    const text = `function f(t)\n  ${body}\nend\n`;
    const { errors, functions } = compileDocument(text);
    expect(errors).toEqual(messages);
    expect(errors).toEqual(luauFirstError(text));
    expect(functions).toEqual([{ path: "f", lines: [0, 0, text.split("\n").length - 2] }]);
  });

  // #1156: a dangling member access after a receiver that is not a plain
  // path, on a continuation line and as an assignment target. The function
  // ends at its own `end` (line 4, or 5 for the continuation line).
  test.each([
    ["a parenthesized receiver", ["local y = (t).a."], 4],
    ["a call result receiver", ["local y = get().a."], 4],
    ["a numeric indexer receiver", ["local y = t[1].a."], 4],
    ["a string indexer receiver", ['local y = t["a"].'], 4],
    ["a block comment before the receiver", ["local y = --[[note]]t.a."], 4],
    ["a continuation line", ["local y = t", "  .a."], 5],
    ["a reassignment target", ["t.a. = 1"], 4],
  ])("#1156: %s", (_name, body, endLine) => {
    const lines = ["function f(t, get)", "  local z = 0", ...body.map((line) => `  ${line}`), "  return 1", "end", ""];
    const text = lines.join("\n");
    const { errors, functions } = compileDocument(text);
    expect(errors).toHaveLength(1);
    expect(errors).toEqual(luauFirstError(text));
    expect(functions).toEqual([{ path: "f", lines: [0, 0, endLine] }]);
  });

  test.each([
    // An operand on the next line continues the expression.
    "local y = 1 +\n  2",
    "local y = 1 *\n  print(y)",
    // Keywords that start an expression are operands.
    "local y = 1 ==\n  nil",
    "local y = true and\n  not false",
    "local y = 1 +\n  if true then 1 else 2",
    "local f = nil or\n  function() end",
    // Operators written whole.
    "local y = 1 <= 2",
    "local y = 1 >= 2",
    "local y = 1 ~= 2",
    "y = 1\n  y += 2",
    // A name after the `.`, past a comment on the same line, and concatenation.
    "local y = t.a.--[[c]]b",
    'local y = (t).a .. "x"',
    'local y = t.a.."x"',
    // A call statement and an anonymous function value.
    "print(t.a)",
    "local g = function() end",
  ])("%j in a function is unaffected", (body) => {
    const text = `function f(t)\n  ${body}\n  return 1\nend\n`;
    expect(luauFirstError(text)).toEqual([]);
    expect(compileDocument(text).errors).toEqual([]);
  });

  // A function Sparkdown declares with no parameter list is read as Luau's
  // `function f()`, so its header is no error and its body's first line is
  // read as Luau reads it.
  test.each([
    ["function f\n  x =\nend", ["2:0-2:3 Expected identifier when parsing expression, got 'end'"]],
    ["function f -- note\n  x =\nend", ["2:0-2:3 Expected identifier when parsing expression, got 'end'"]],
    ["function f --[[c]]\n  x =\nend", ["2:0-2:3 Expected identifier when parsing expression, got 'end'"]],
    ["function f\n  local y = 1\n  return y\nend", []],
    ["function f -- note\n  local y = 1\n  return y\nend", []],
  ])("a function with no parameter list, %j, reports %j", (source, messages) => {
    expect(compileDocument(`${source}\n`).errors).toEqual(messages);
  });

  // In a narrative body a declaration ends at its line, and the checker does
  // not read the story after it: what the statement is missing is
  // Sparkdown's own error, once.
  test.each([
    ["-> s\nscene s\n  local y = 1 +\n  local z = 2\nend", ["3:2-3:7 Expected identifier when parsing expression, got 'local'"]],
    ["-> s\nscene s\n  local y = 1 +\nend", ["3:0-3:3 Expected identifier when parsing expression, got 'end'"]],
    ["-> s\nscene s\n  local a, b = 1,\n  Hello there.\n  local c = 3\nend", ["2:16-2:17 Expected identifier when parsing expression, got 'Hello'"]],
    ["store hp = 100,\nThe hero has {hp} health.\nstore mp = 50,\nscene s\n  Hi.\nend", [
      "0:14-0:15 Expected identifier when parsing expression, got 'The'",
      "2:13-2:14 Expected identifier when parsing expression, got 'scene'",
    ]],
    ["store a, b = 1,\n  2", ["0:14-0:15 Expected identifier when parsing expression, got '2'"]],
    ["store x = 1 +;", ["0:13-0:14 Expected identifier when parsing expression, got ';'"]],
    ["store x = 1 +\nlocal z = 2", ["1:0-1:5 Expected identifier when parsing expression, got 'local'"]],
    ["-> s\nscene s\n  if then\n    Hi.\n  end\nend", ["2:5-2:9 Expected identifier when parsing expression, got 'then'"]],
  ])("in a Sparkdown document, %j reports %j", (source, messages) => {
    expect(compileDocument(`${source}\n`).errors).toEqual(messages);
  });

  // #1144 and #1148 at runtime: the story reports the error and a named
  // function value still fills its slot.
  test("#1144: a value on the line after a list that lacks its comma is an error", () => {
    const ctx = makeRuntimeStoryFromSource("Value {f()}.\nfunction f()\n  local a, b = 1\n    2\n  return b\nend\n");
    expect(ctx.errorMessages).toEqual(["Expected identifier when parsing expression, got '2'"]);
  });
});
