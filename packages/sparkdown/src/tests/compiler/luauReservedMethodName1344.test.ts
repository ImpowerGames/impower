import { describe, expect, test } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorsInReportOrder } from "./officialSyntax";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const HEADER = "function run()\n  ";
const FOOTER = "\nend\n";
const STORY = "After {run()}.\n";

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

function topLevelAt(text: string, offset: number): SyntaxNode | null {
  let node = parseSource(text).topNode.firstChild;
  while (node && node.to <= offset) node = node.nextSibling;
  return node;
}

function expectForm(form: string, first: string): void {
  const luau = `${HEADER}${form}${FOOTER}`;
  const text = `${luau}${STORY}`;
  const tree = stripAnsi(dumpTree(text));
  expect(tree, tree).not.toContain("ERROR_INCOMPLETE");

  const fn = parseSource(text).topNode.firstChild!;
  expect(fn.name).toBe("LuauFunctionDefinition");
  expect([fn.from, fn.to], `the function ends at its own \`end\`\n${tree}`).toEqual([0, luau.length - 1]);

  const story = topLevelAt(text, luau.length);
  const control = topLevelAt(`${HEADER}x = 1${FOOTER}${STORY}`, `${HEADER}x = 1${FOOTER}`.length);
  expect([story?.name, story?.from], "the line after the function is read as it is after a function without the form").toEqual([control?.name, luau.length]);

  const official = officialErrorsInReportOrder(luau);
  expect(official[0]?.slice(official[0].indexOf(" ") + 1), `Luau's first error:\n${official.join("\n")}`).toBe(first);
  expect(sparkdownErrors(text)).toEqual([...official].sort());
}

const METHOD_NAME = (word: string) => `Expected identifier when parsing method name, got '${word}'`;

const CASES: Record<string, [form: string, first: string][]> = {
  "after a bracketed receiver": [
    ["local t = {}\n  local b = (t):end", METHOD_NAME("end")],
    ["local function f() end\n  local b = f():end", METHOD_NAME("end")],
    ["local t = {}\n  local b = t:end", METHOD_NAME("end")],
    ["local t = {}\n  local b = (t):  end", METHOD_NAME("end")],
    ["local t = {}\n  local b = (t): --[[c]] end", METHOD_NAME("end")],
    ["local t = {}\n  (t):end()", METHOD_NAME("end")],
    ["local t = {}\n  local b = (t):function", METHOD_NAME("function")],
    ["local t = {}\n  local b = (t):local", METHOD_NAME("local")],
    ["local t = {}\n  local b = (t):if", METHOD_NAME("if")],
    ["local t = {}\n  local b = (t):while", METHOD_NAME("while")],
    ["local t = {}\n  local b = (t):repeat", METHOD_NAME("repeat")],
    ["local t = {}\n  local b = (t):until", METHOD_NAME("until")],
    ["local t = {}\n  local b = (t):return", METHOD_NAME("return")],
    ["local t = {}\n  local b = (t):else", METHOD_NAME("else")],
    ["local t = {}\n  local b = (t):elseif", METHOD_NAME("elseif")],
    ["local t = {}\n  local b = (t):for", METHOD_NAME("for")],
    ["local t = {}\n  local b = (t):nil", METHOD_NAME("nil")],
    ["local t = {}\n  local b = (t):true", METHOD_NAME("true")],
    ["local t = {}\n  local b = (t):and", METHOD_NAME("and")],
    ["local t = {}\n  local b = (t):not", METHOD_NAME("not")],
    ["local t = {}\n  local b = (t):in", METHOD_NAME("in")],
    ["local t = {}\n  local b = (t):break", METHOD_NAME("break")],
    ["local t = {}\n  local b = t.a():end", METHOD_NAME("end")],
    ["local t = {}\n  local b = t:m():end", METHOD_NAME("end")],
    ["local t = {}\n  local b = (t)[1]:end", METHOD_NAME("end")],
    ["local t = {}\n  local b = f(t:end)", METHOD_NAME("end")],
    ["local t = {}\n  local b = f((t):end)", METHOD_NAME("end")],
    ["local t = {}\n  if (t):end then end", METHOD_NAME("end")],
    ["local t = {}\n  while (t):end do end", METHOD_NAME("end")],
    ["local t = {}\n  return (t):end", METHOD_NAME("end")],
    ["local t = {}\n  local b = (t) :end", METHOD_NAME("end")],
    ["local t = {}\n  local b = (t): --[====[c]====] end", METHOD_NAME("end")],
    ["local t = {}\n  local b = (t): --[========[c]========] end", METHOD_NAME("end")],
    ["local t = {}\n  local b = t: --[====[c]====] end", METHOD_NAME("end")],
    ["local t = {}\n  local b = t :: T: --[=====[c]=====] do", "Expected identifier when parsing expression, got ':'"],
    ["local t = {}\n  while t: --[====[c]====] do end", METHOD_NAME("do")],
    ["local t = {}\n  if t: --[====[c]====] then end", METHOD_NAME("then")],
    ["local b = 1:end", "Expected identifier when parsing expression, got ':'"],
    ['local b = "s":end', "Expected identifier when parsing expression, got ':'"],
    ["local b = {}:end", "Expected identifier when parsing expression, got ':'"],
  ],
  "after a type assertion, an if expression or a header's comma": [
    ["local b = t :: T:do", "Expected identifier when parsing expression, got ':'"],
    ["while t :: T:do end", "Expected 'do' when parsing while loop, got ':'"],
    ["if t :: T:then end", "Expected 'then' when parsing if statement, got ':'"],
    ["for k in t :: T:then do end", "Expected 'do' when parsing for loop, got ':'"],
    ["local b = t :: typeof(t):do", "Expected identifier when parsing expression, got ':'"],
    ["local b = if t then a else b:do", METHOD_NAME("do")],
    ["while if t then a else b:do end", METHOD_NAME("do")],
    ["while a, 1:do end", "Expected 'do' when parsing while loop, got ','"],
    ["if a, 1:then end", "Expected 'then' when parsing if statement, got ','"],
    ["local b = t :: T:end", "Expected identifier when parsing expression, got ':'"],
    ["local b = t :: T:function", "Expected identifier when parsing expression, got ':'"],
    ["local b = t :: {number}:end", "Expected identifier when parsing expression, got ':'"],
    ["local b = f(t :: T:end)", "Expected ')' (to close '(' at column 14), got ':'"],
    ["local b = t :: T | U:end", "Expected identifier when parsing expression, got ':'"],
    ["local b = t :: T & U:do", "Expected identifier when parsing expression, got ':'"],
    ["local b = t :: () -> T:end", "Expected identifier when parsing expression, got ':'"],
    ["local b = t :: T?:end", "Expected identifier when parsing expression, got ':'"],
    ["local b = t :: Array<T>:end", "Expected identifier when parsing expression, got ':'"],
    ["local b = t :: M.T:function", "Expected identifier when parsing expression, got ':'"],
    ["while t :: T | U:do end", "Expected 'do' when parsing while loop, got ':'"],
    ["local b = if t then a else b:end", METHOD_NAME("end")],
  ],
  "well-formed code": [
    ["local t = {}\n  local b = (t):foo()", "none"],
    ["local t = {}\n  local b = t:m():n()", "none"],
    ["local x = 1 :: number", "none"],
    ["for k: number in pairs({}) do end", "none"],
    ["local function f(): nil return nil end", "none"],
    ["local g = function(a: nil): nil return a end", "none"],
    ["type F = (a: nil) -> nil", "none"],
    ["local x: {a: nil, b: true} = {a = nil, b = true}", "none"],
    ["local y = if true then 1 else 2", "none"],
    ["local z = (1 :: number)", "none"],
  ],
};

test.each([["local b = t :: T | :end"], ["local b = t :: T & :do"], ["local b = t :: () -> :end"]])(
  "a reserved method name after a type operator leaves the tree whole: %s",
  (form) => {
    const text = `${HEADER}${form}${FOOTER}${STORY}`;
    expect(stripAnsi(dumpTree(text))).not.toContain("ERROR_INCOMPLETE");
  },
);

test.each([
  ["local t = {}\n  local b = (t): --[====[a]=====] end ]====] foo()"],
  ["local t = {}\n  local b = (t): --[=========[a]==========] end ]=========] foo()"],
])("a reserved word inside a method's trivia comment is no method's name: %s", (form) => {
  const luau = `${HEADER}${form}${FOOTER}`;
  const text = `${luau}${STORY}`;
  const tree = stripAnsi(dumpTree(text));
  expect(tree).not.toContain("ERROR_INCOMPLETE");
  expect(tree).not.toContain("LuauKeywordMethodName");
  const fn = parseSource(text).topNode.firstChild!;
  expect([fn.name, fn.from, fn.to]).toEqual(["LuauFunctionDefinition", 0, luau.length - 1]);
  expect(officialErrorsInReportOrder(luau)).toEqual([]);
  expect(sparkdownErrors(text)).toEqual([]);
});

describe("a reserved word read as a method's name (I-1344, I-1351)", () => {
  for (const [name, forms] of Object.entries(CASES)) {
    describe(name, () => {
      for (const [form, first] of forms) {
        test(JSON.stringify(form), () => {
          if (first === "none") {
            const luau = `${HEADER}${form}${FOOTER}`;
            const text = `${luau}${STORY}`;
            expect(stripAnsi(dumpTree(text))).not.toContain("ERROR_INCOMPLETE");
            const fn = parseSource(text).topNode.firstChild!;
            expect([fn.name, fn.from, fn.to]).toEqual(["LuauFunctionDefinition", 0, luau.length - 1]);
            expect(officialErrorsInReportOrder(luau)).toEqual([]);
            expect(sparkdownErrors(text)).toEqual([]);
          } else {
            expectForm(form, first);
          }
        });
      }
    });
  }
});
