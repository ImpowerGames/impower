import { expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { checkLuau } from "./typecheckTestHarness";
import { testCompiler } from "../engineUnderTest";
import { officialSyntaxErrors } from "../compiler/officialSyntax";
import { NO_START_SCENE_MESSAGE } from "../../compiler/utils/startScene";

const inFunction = (body: string) =>
  `scene start\n  Value {f()}.\nend\nfunction f()\n${body
    .split("\n")
    .map((line) => (line ? `  ${line}` : line))
    .join("\n")}\nend\n`;

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
  [
    "a type alias, with a block comment and a statement after it on its line",
    "type T = number\n& number --[[note]] local a = 9\nreturn a",
  ],
  [
    "a type alias, with a statement right after it on its line",
    "type T = {}\n& {}local a = 9\nreturn a",
  ],
  [
    "a type alias, with a function statement right after it on its line",
    "type T = {}\n& {}function g() end\nreturn 1",
  ],
  [
    "a return type, with a return right after it on its line",
    "local function g(): {}\n  & {}return {}\nend\nreturn 1",
  ],
  [
    "an annotation, with a value, a block comment and a statement on its line",
    "local a = 1\nlocal w: number\n  & number = a --[[note]] local b = 2\nreturn w + b",
  ],
])("an intersection line after %s reads as Luau", (_name, body) => {
  expect(checkLuau(body).syntaxDiagnostics).toEqual([]);
});

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
])("an intersection line after %s runs", (_name, body, value) => {
  const ctx = makeRuntimeStoryFromSource(inFunction(body));
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe(`Value ${value}.\n`);
});

test.each(["store", "const", "continue", "goto"])(
  "an intersection member named %s reads as Luau",
  (name) => {
    const body = `type ${name} = {}\ntype T = {}\n& ${name}\nreturn 1`;
    expect(officialSyntaxErrors(`function f()\n${body}\nend\n`)).toEqual([]);
    expect(checkLuau(body).syntaxDiagnostics).toEqual([]);
  },
);

test("a statement right after a member's type on its line runs", () => {
  const ctx = makeRuntimeStoryFromSource(
    inFunction("local a = 1\ntype T = {}\n& {}a = 9\nreturn a"),
  );
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("Value 9.\n");
});

test.each([
  ["at the start of the line", "& {}a = 9"],
  ["indented", "  & {}a = 9"],
  ["after a block comment", "& {}--[[c]]a = 9"],
])("a statement after a return type's member line runs (%s)", (_name, line) => {
  const ctx = makeRuntimeStoryFromSource(
    `store a = 1\nscene start\n  Value {f().a}.\nend\nfunction f(): {}\n${line}\nreturn {a = a}\nend\n`,
  );
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("Value 9.\n");
});

test.each([
  ["table members", "type T = {}\n& {}\n& {}\nreturn 1"],
  ["named members", "type A = {}\ntype B = {}\ntype T = {}\n& A\n& B\nreturn 1"],
  ["mixed indentation", "type T = {}\n& {}\n  & {}\n& {}\nreturn 1"],
])("consecutive member lines at the start of the line read as Luau (%s)", (_name, body) => {
  expect(officialSyntaxErrors(`function f()\n${body}\nend\n`)).toEqual([]);
  expect(checkLuau(body).syntaxDiagnostics).toEqual([]);
});

test.each(["& {}", "& print(1)", "&Hello", "& {}a = 9"])(
  "an `&` line that continues no type is reported as Luau reports it: %s",
  (line) => {
    const luau = officialSyntaxErrors(`function f()\n${line}\nreturn 1\nend\n`).map((e) => [
      e.location.begin.line - 1,
      e.location.begin.column,
      e.message,
    ]);
    expect(luau[0]?.[2]).toBe(AMPERSAND_ERROR);
    expect(
      checkLuau(`${line}\nreturn 1`).syntaxDiagnostics.map((d) => [d.line, d.column, d.message]),
    ).toEqual(luau);
    expect(errorMessages(`function f()\n${line}\nreturn 1\nend\n`)).toEqual(luau.map((e) => e[2]));
  },
);

test("an `&` line reports what the same line without its `&` reports", () => {
  const plain = checkLuau("()\nreturn 1").syntaxDiagnostics.map((d) => d.message);
  expect(checkLuau("& ()\nreturn 1").syntaxDiagnostics.map((d) => d.message)).toEqual([
    AMPERSAND_ERROR,
    ...plain,
  ]);
});

test.each([
  ["a backtick string", "`Value {a}`"],
  ["a double-quoted string", '"Value {a}"'],
])("a statement after a member line keeps the interpolation of %s", (_name, text) => {
  const ctx = makeRuntimeStoryFromSource(
    `store result = ""\nstore a = 3\nfunction capture(s)\n  result = s\nend\nfunction f()\n  type T = {}\n  & {}capture(${text})\nend\nscene start\n  & f()\n  {result}\nend\n`,
  );
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("Value 3\n");
});

test.each(["& {}a = 1 +", '& {}a = "x" ..', "& {}a = `v {1}` .."])(
  "a malformed value after a member line is reported as Luau reports it: %s",
  (line) => {
    const source = `function f()\n  type T = {}\n  ${line}\n  return 1\nend\n`;
    expect(errorMessages(source)).toEqual(officialSyntaxErrors(source).map((e) => e.message));
  },
);

test.each([
  ["a regular expression", "", "typeof(@/hello/)"],
  ["a new", "define Foo with\n  init()\n  end\nend\n", "typeof(new Foo())"],
])("a member line's typeof reads %s as one line does", (_name, before, member) => {
  const body = (type: string) => `${before}function f()\n  ${type}\n  return 1\nend\n`;
  expect(errorMessages(body(`type T = {} & ${member}`))).toEqual([]);
  expect(errorMessages(body(`type T = {}\n  & ${member}`))).toEqual([]);
});

test.each([
  ["a type alias", "type T = number\n& number local a = 9\nreturn a", "9"],
  ["a return type", "local function g(): number\n  & number return 8\nend\nreturn g()", "8"],
])("a statement after a member line of %s runs", (_name, body, value) => {
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

const errorMessages = (source: string) => {
  const uri = "inmemory:///main.sd";
  const compiler = testCompiler();
  compiler.configure({
    files: [{ uri, type: "script", name: "main", ext: "sd", text: source, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = (compiler.compile({ textDocument: { uri } } as never) as any).program;
  return ((program.diagnostics?.[uri] ?? []) as any[])
    .filter((d) => d.severity === 1)
    .map((d) => (typeof d.message === "string" ? d.message : d.message.value))
    .filter((message) => message !== NO_START_SCENE_MESSAGE);
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

test("a marked statement in a function neither runs nor leaves its block", () => {
  const ctx = makeRuntimeStoryFromSource(
    "store count = 0\nfunction bump()\n  if false then\n    & count += 1\n  end\nend\nscene start\n  & bump()\n  The count is {count}.\nend\n",
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

test.each([
  ["\n", "LF"],
  ["\r\n", "CRLF"],
])("a story marked statement ends at its line (%#)", (eol) => {
  const ctx = makeRuntimeStoryFromSource(
    [
      "store count = 0",
      "scene start",
      "  & count += 1",
      "  The count is {count}.",
      "end",
      "",
    ].join(eol),
  );
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("The count is 1.\n");
});

test("a marked line after a declaration in story text is a statement", () => {
  const ctx = makeRuntimeStoryFromSource(
    "scene start\n  local s: number\n  & s = 2\n  Value {s}.\nend\n",
  );
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("Value 2.\n");
});

test("a marked line after a type alias in story text is a statement", () => {
  expect(
    errorMessages("store s = 1\ntype T = number\n& s += 1\nscene start\nend\n"),
  ).toEqual([
    "statement must be inside a scene or branch; the top level holds declarations only",
  ]);
});
