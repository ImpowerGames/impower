import { expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { checkLuau } from "./typecheckTestHarness";

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
  ["a union member", "type F = number\n| string\n& boolean\nreturn 1"],
])("an intersection line after %s reads as Luau", (_name, body) => {
  expect(checkLuau(body).syntaxDiagnostics).toEqual([]);
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
// error, and its statement neither runs nor moves out of its block.
test.each([
  ["a call", "& print(1)\nreturn 1", "& print(1)", [0, 0]],
  ["an assignment", "local a = 1\n& a = 2\nreturn a", "& a = 2", [1, 0]],
  [
    "a call in a nested block",
    "if false then\n  & print(1)\nend\nreturn 1",
    "& print(1)",
    [1, 2],
  ],
])("a marked %s in a function is reported", (_name, body, line, [row, column]) => {
  expect(
    checkLuau(body).syntaxDiagnostics.map((d) => [d.line, d.column, d.message]),
  ).toEqual([[row, column, "Expected identifier when parsing expression, got '&'"]]);
  const ctx = makeRuntimeStoryFromSource(inFunction(body));
  expect(ctx.errorMessages).toEqual([
    `\`${line}\` continues a type, but the line before it does not end in one.`,
  ]);
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
