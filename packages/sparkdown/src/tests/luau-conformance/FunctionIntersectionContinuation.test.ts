import { expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { checkLuau } from "./typecheckTestHarness";
import { testCompiler } from "../engineUnderTest";
import { officialSyntaxErrors } from "../compiler/officialSyntax";

// A function body is Luau, so a line there that begins with `&` continues the
// type before it as an intersection, as Luau reads it. `&` marks a Luau
// statement only in story text, where it ends at its line (#1374).
const inFunction = (body: string) =>
  `Value {f()}.\nfunction f()\n${body
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n")}\nend\n`;

// TypeInfer.functions.test.cpp, `luau_subtyping_is_np_hard`, at Luau
// 7d5f73364fdbbaa984fa545071630eba73cfea98, verbatim.
const LUAU_SUBTYPING_IS_NP_HARD = `
--!strict

-- An example of coding up graph coloring in the Luau type system.
-- This codes a three-node, two color problem.
-- A three-node triangle is uncolorable,
-- but a three-node line is colorable.

type Red = "red"
type Blue = "blue"
type Color = Red | Blue
type Coloring = (Color) -> (Color) -> (Color) -> boolean
type Uncolorable = (Color) -> (Color) -> (Color) -> false

type Line = Coloring
  & ((Red) -> (Red) -> (Color) -> false)
  & ((Blue) -> (Blue) -> (Color) -> false)
  & ((Color) -> (Red) -> (Red) -> false)
  & ((Color) -> (Blue) -> (Blue) -> false)

type Triangle = Line
  & ((Red) -> (Color) -> (Red) -> false)
  & ((Blue) -> (Color) -> (Blue) -> false)

local x : Triangle
local y : Line
local z : Uncolorable
z = x -- OK, so the triangle is uncolorable
z = y -- Not OK, so the line is colorable
    `;

test("luau_subtyping_is_np_hard reads as Luau", () => {
  expect(checkLuau(LUAU_SUBTYPING_IS_NP_HARD).syntaxDiagnostics).toEqual([]);
});

test.each([
  ["a type alias", "type F = number\n& string\nreturn 1"],
  [
    "an annotation",
    "local v: { x: number }\n  & { y: string } = { x = 1, y = \"ok\" }\nreturn v.x",
  ],
  [
    "a type alias in a nested block",
    "if true then\n  type F = { x: number }\n    & { y: string }\nend\nreturn 1",
  ],
  [
    "a type alias in an anonymous function",
    "local g = function()\n  type F = { x: number }\n    & { y: string }\n  return 1\nend\nreturn g()",
  ],
  [
    "a parameter annotation",
    "local function g(v: { x: number }\n  & { y: string })\n  return v.x\nend\nreturn 1",
  ],
  [
    "a return type",
    'local function g(): { x: number }\n  & { y: string }\n  return { x = 1, y = "ok" }\nend\nreturn 1',
  ],
  ["a comment line", "type F = number\n-- note\n& string\nreturn 1"],
  [
    "a parenthesized union",
    "type F = (number\n| string)\n& boolean\nreturn 1",
  ],
  [
    "a type alias, with a statement after it on its line",
    "type T = number\n& number local a = 9\nreturn a",
  ],
  [
    "a return type, with a statement after it on its line",
    "local function g(): number\n  & number return 1\nend\nreturn g()",
  ],
])("an intersection line after %s reads as Luau", (_name, body) => {
  expect(checkLuau(body).syntaxDiagnostics).toEqual([]);
});

// Luau does not mix a union and an intersection without parentheses, and
// an intersection line after a union line is that error, as on one line.
test("an intersection line after a union line is Luau's mixing error", () => {
  expect(
    checkLuau("type F = number\n| string\n& boolean\nreturn 1").syntaxDiagnostics.map(
      (d) => d.message,
    ),
  ).toEqual([
    "Mixing union and intersection types is not allowed; consider wrapping in parentheses.",
  ]);
});

test.each([
  [
    "a type alias",
    'type Combined = { x: number }\n  & { y: string }\nlocal value: Combined = { x = 1, y = "ok" }\nreturn value.x',
    "1",
  ],
  [
    "a local annotation",
    'local value: { x: number }\n  & { y: string } = { x = 2, y = "ok" }\nreturn value.x',
    "2",
  ],
  [
    "a type alias in a nested loop",
    'local n = 0\nfor i = 1, 3 do\n  type T = { x: number }\n    & { y: string }\n  local t: T = { x = i, y = "ok" }\n  n += t.x\nend\nreturn n',
    "6",
  ],
  [
    "a type alias in an anonymous function",
    'local g = function()\n  type T = { x: number }\n    & { y: string }\n  local t: T = { x = 4, y = "ok" }\n  return t.x\nend\nreturn g()',
    "4",
  ],
  [
    "a type alias and the statement after it",
    'type T = { x: number }\n  & { y: string }\nlocal a = 5\nreturn a',
    "5",
  ],
  [
    "a return type",
    'local function g(): { x: number }\n  & { y: string }\n  return { x = 7, y = "ok" }\nend\nreturn g().x',
    "7",
  ],
  [
    "a type alias, with a statement after it on its line",
    "type T = number\n& number local a = 9\nreturn a",
    "9",
  ],
  [
    "a return type, with a statement after it on its line",
    "local function g(): number\n  & number return 8\nend\nreturn g()",
    "8",
  ],
])("an intersection line after %s runs", (_name, body, value) => {
  const ctx = makeRuntimeStoryFromSource(inFunction(body));
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe(`Value ${value}.\n`);
});

test("an intersection line runs with CRLF line endings", () => {
  const source = inFunction(
    'type T = { x: number }\n  & { y: string }\nlocal t: T = { x = 3, y = "ok" }\nreturn t.x',
  ).replaceAll("\n", "\r\n");
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("Value 3.\n");
});

// The marker is gone from function bodies: a written one is Luau's syntax
// error, reported as Luau reports it.
const AMPERSAND_ERROR = "Expected identifier when parsing expression, got '&'";
test.each([
  ["a call", "& print(1)\nreturn 1", [0, 0]],
  ["an assignment", "local a = 1\n& a = 2\nreturn a", [1, 0]],
  ["a call in a nested block", "if false then\n  & print(1)\nend\nreturn 1", [1, 2]],
  ["a marker with no space", "&print(1)\nreturn 1", [0, 0]],
])("a marked %s in a function is reported", (_name, body, [row, column]) => {
  expect(
    checkLuau(body).syntaxDiagnostics.map((d) => [d.line, d.column, d.message]),
  ).toEqual([[row, column, AMPERSAND_ERROR]]);
  const ctx = makeRuntimeStoryFromSource(inFunction(body));
  expect(ctx.errorMessages).toEqual([AMPERSAND_ERROR]);
});

// A define's method is a function body too, which the lowerer reports
// rather than the type checker: a marked line there is reported as Luau
// reports the same body, and nothing else (a method call's `:` is not a
// type's).
const errorMessages = (source: string) => {
  const uri = "inmemory:///main.sd";
  const compiler = testCompiler();
  compiler.configure({
    files: [{ uri, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = (compiler.compile({ textDocument: { uri } } as never) as any).program;
  return ((program.diagnostics?.[uri] ?? []) as any[])
    .filter((d) => d.severity === 1)
    .map((d) => (typeof d.message === "string" ? d.message : d.message.value));
};
test.each(["local t = {}\n& t:missing()", "local a\n& a =", "& local v: = 1"])(
  "a marked line in a define's method is reported as Luau reports it: %s",
  (body) => {
    const lines = body.split("\n");
    const luau = officialSyntaxErrors(
      `function greet()\n${lines.map((l) => `  ${l}`).join("\n")}\n  return 1\nend\n`,
    ).map((e) => e.message);
    expect(luau[0]).toBe(AMPERSAND_ERROR);
    for (const header of ["greet()", "function greet()"]) {
      const source = `define X with\n  ${header}\n${lines.map((l) => `    ${l}`).join("\n")}\n    return 1\n  end\nend\n`;
      expect(errorMessages(source), header).toEqual(luau);
    }
  },
);

// A marked statement in a block that does not run is neither run nor moved
// out of the block: the story still plays, and the count stays 0.
test("a marked statement in a function neither runs nor leaves its block", () => {
  const ctx = makeRuntimeStoryFromSource(
    "store count = 0\nfunction bump()\n  if false then\n    & count += 1\n  end\nend\n& bump()\nThe count is {count}.\n",
  );
  expect(ctx.errorMessages).toEqual([AMPERSAND_ERROR]);
  expect(ctx.story.ContinueMaximally()).toBe("The count is 0.\n");
});

test("a call and assignment without the marker run in a function", () => {
  const ctx = makeRuntimeStoryFromSource(
    inFunction("local a = 1\na = a + 1\nif true then\n  a += 1\nend\nreturn a"),
  );
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("Value 3.\n");
});

// In story text a marked statement ends at its line, and the story line
// after it plays in order.
test.each([
  ["\n", "LF"],
  ["\r\n", "CRLF"],
])("a story marked statement ends at its line (%#)", (eol) => {
  const ctx = makeRuntimeStoryFromSource(
    ["store count = 0", "& count += 1", "The count is {count}.", ""].join(eol),
  );
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("The count is 1.\n");
});

// A type that ends its line in story text does not take a marked line after
// it: the `&` there marks a statement, not an intersection.
test.each([
  ["a declaration", "local s: number\n& s = 2\nValue {s}.\n", "Value 2.\n"],
  [
    "a type alias",
    "store s = 1\ntype T = number\n& s += 1\nValue {s}.\n",
    "Value 2.\n",
  ],
])("a marked line after %s in story text is a statement", (_name, source, text) => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe(text);
});
