// A reserved word read as a method's name in the forms I-1344 left (I-1467):
// after a declaration's type annotation (`local x: T:end`, I-1447), after a
// value that follows a comma in a `for` header (`for k in a, b:end do`,
// I-1448), after a type operator with no right operand (`t :: T | :end`,
// I-1450) and after a block comment of level 9 or more
// (`(t): --[=========[c]=========] end`, I-1459). Each form stands in a function in a `.sd` document with a story
// line after it. The word opens no block and closes none, so the function
// ends at its own `end`, the tree holds no `ERROR_INCOMPLETE`, the story line
// is the story's, Sparkdown's syntax errors are the official parser's,
// message and range, both TextMate engines read the form alike, and an
// incremental compile reports what a cold one does.
import { describe, expect, test } from "vitest";
import type { SyntaxNode } from "@lezer/common";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { inPositionOrder, officialErrorList } from "./officialSyntax";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const HEADER = "function run()\n  ";
const FOOTER = "\nend\n";
const STORY = "After {run()}.\n";

function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

/** Sparkdown's syntax errors, as `start-end message` in 0-based lines and characters, in position order. */
function errorsOf(compiler: SparkdownCompiler): string[] {
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program;
  return inPositionOrder(
    (program.diagnostics?.[URI] ?? [])
      .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
      .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`),
  );
}

/** The position of `offset` in `text`, as an LSP position. */
function positionAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
}

// A function ahead of the form, whose `0` an edit makes longer: the edit is
// away from the form, on a line before it, and changes no line count.
const PADDING = "function padding()\n  local p = 0\nend\n";

/** Asserts that an edit in `PADDING` ahead of `text` reports what a cold compile of the edited text does. */
function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  for (const [offset, removed, insert] of [
    [padded.indexOf("0"), 1, "10000000000"],
    [padded.indexOf("local p"), 0, "    "],
  ] as const) {
    const compiler = newCompiler(padded);
    compiler.compile({ textDocument: { uri: URI } } as never);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: positionAt(padded, offset), end: positionAt(padded, offset + removed) }, text: insert }],
    } as never);
    const edited = padded.slice(0, offset) + insert + padded.slice(offset + removed);
    expect(errorsOf(compiler), `after ${JSON.stringify(insert)}`).toEqual(errorsOf(newCompiler(edited)));
  }
}

/** The top-level node a document offset lies in. */
function topLevelAt(text: string, offset: number): SyntaxNode | null {
  let node = parseSource(text).topNode.firstChild;
  while (node && node.to <= offset) node = node.nextSibling;
  return node;
}

const METHOD_NAME = (word: string) => `Expected identifier when parsing method name, got '${word}'`;

/**
 * Each form, with the reserved word Luau reads as the method's name (`null`
 * where Luau reads none: well-formed code, which the official parser reports
 * nothing for, or a `:` that is a type's). `closesAt` is the form's text up
 * to the `end` that Luau closes the function on, where that is not the
 * function's own.
 */
const CASES: Record<string, [form: string, word: string | null, closesAt?: string][]> = {
  "after a declaration's type annotation (I-1447)": [
    ["local x: T:end", "end"],
    ["local x: T:do", "do"],
    ["local x: T:function", "function"],
    ["local x: T:end\n  return 1", "end"],
    ["local x: T :end", "end"],
    ["local x: T: --[[c]] end", "end"],
    ["local x: {number}:end", "end"],
    ["local x: T | U:end", "end"],
    ["local x, y: T:end", "end"],
    ["local x: T: --[=========[c]=========] end", "end"],
    // Types whose brackets hold a `:` or a `,` (round 1, `ax` finding 1).
    ["local x: {a: number}:end", "end"],
    ["local x: {a: number, b: string}:end", "end"],
    ["local x: {a: {b: T}}:end", "end"],
    ["local x: (a: number) -> T:end", "end"],
    ["local x: Array<A, B>:end", "end"],
    ["local x, y: {a: number}:end", "end"],
    // Any complete type, which the type reads the `:` after (round 1,
    // `undirected` finding 1).
    ["local x: {a: {b: {c: T}}}:end", "end"],
    ["local x: T --[[c]] :end", "end"],
    ["local x: T | --[[c]] U:end", "end"],
    ["local x: typeof({a = {b = 1}}):end", "end"],
    ["local x: {a: {b: {c: T}}}:function", "function"],
    ["local x: T:nil", "nil"],
    // Round 2, `gb` finding 3: a type the annotation's lexical test reads
    // (three levels of brackets, comments) before `:do` or a long comment.
    ["local x: {a: {b: {c: number}}}: --[=========[c]=========] end", "end"],
    ["local x: {a: {b: {c: number}}}:do", "do"],
    ["local x: T --[[c]] :do", "do"],
    ["local x: T --[[c]] : --[=========[c]=========] end", "end"],
    ["local x: T | --[[c]] U:do", "do"],
    // A function's return type, which the ticket asked to check.
    ["local function f(): T:end end", "end"],
    ["local function f(): T:end\n  end", "end"],
    ["local function f(): T | :end end", "end"],
  ],
  "after a value that follows a comma in a for header (I-1448)": [
    ["local a, b = {}, {}\n  for k in a, b:end do end", "end"],
    ["local a = {}\n  for k in a, a:end do end", "end"],
    ["local a, b = {}, {}\n  for k in a, b:function do end", "function"],
    ["local n = 1\n  for i = 1, n:end do end", "end"],
    ["local a, b = {}, {}\n  for k, v in a, b:end do end", "end"],
  ],
  "after a type operator with no right operand (I-1450)": [
    ["local t = {}\n  local b = t :: T | :end", "end"],
    ["local t = {}\n  local b = t :: () -> :end", "end"],
    ["local t = {}\n  local b = t :: T & :end", "end"],
    ["local t = {}\n  local b = t :: T & :do", "do"],
    ["local t = {}\n  local b = t :: T | : --[[c]] end", "end"],
    ["local t = {}\n  local b = t :: T | : --[=========[c]=========] end", "end"],
    ["local t = {}\n  local b = t :: T | :function", "function"],
    // `do` and `then` past a long comment at a stray `:` are the method's
    // name outside a header, and the header's in one (round 2, `undirected`
    // finding 2).
    ["local x: T | : --[=========[c]=========] do", "do"],
    ["local x: T | : --[=========[c]=========] then", "then"],
    ["local t = {}\n  local b = t :: T | : --[=========[c]=========] do", "do"],
    ["local t = {}\n  while t :: T | : --[=========[c]=========] do end", null],
    ["local t = {}\n  if t :: T | : --[=========[c]=========] then end", null],
    // A header word in a comment or a string is no header, and a header on
    // the line before is one (round 3, `undirected` finding 2).
    ["local x: T | : --[=========[while]=========] do", "do"],
    ["local x: T | : --[=========[if]=========] then", "then"],
    ['local s = "while"\n  local x: T | : --[=========[c]=========] do', "do"],
    ["local t = {}\n  while\n    t :: T | : --[=========[c]=========] do end", null],
    ["local t = {}\n  if\n    t :: T | : --[=========[c]=========] then end", null],
  ],
  "after a block comment of level 9 or more (I-1459)": [
    ["local t = {}\n  local b = (t): --[=========[c]=========] end", "end"],
    ["local t = {}\n  local b = t: --[=========[c]=========] end", "end"],
    ["local t = {}\n  local b = (t): --[============[c]============] end", "end"],
    ["local t = {}\n  local b = (t): --[==[a]==] --[==========[b]==========] end", "end"],
    ["local t = {}\n  local b = (t): --[========[c]========] end", "end"],
    ["local t = {}\n  local b = t :: T: --[=========[c]=========] end", "end"],
    // A header's `do` or `then` stays the header's past such a comment, as
    // Luau's reading of the block's extent has it; anywhere else it is the
    // method's name (round 1, `undirected` finding 2).
    ["local t = {}\n  while t: --[=========[c]=========] do end", "do"],
    ["local t = {}\n  while (t): --[=========[c]=========] do end", "do"],
    ["local t = {}\n  for k in t: --[=========[c]=========] do end", "do"],
    ["local t = {}\n  if t: --[=========[c]=========] then end", "then"],
    ["local t = {}\n  if (t): --[=========[c]=========] then end", "then"],
    ["local t = {}\n  local b = (t): --[=========[c]=========] do", "do"],
    ["local t = {}\n  local b = t: --[=========[c]=========] do", "do"],
    ["local t = {}\n  local b = t :: T: --[=========[c]=========] do", "do"],
    ["local t = {}\n  local b = (t): --[=========[c]=========] then", "then"],
    ["local x: T: --[=========[c]=========] do", "do"],
    // Round 2, `gb` finding 1: the access inside an operand of a header's
    // condition.
    ["local t = {}\n  while not t: --[=========[c]=========] do end", "do"],
    ["local t = {}\n  while t + t: --[=========[c]=========] do end", "do"],
    ["local t = {}\n  if not t: --[=========[c]=========] then end", "then"],
    ["local t = {}\n  local b = not t: --[=========[c]=========] do", "do"],
    // A `]` in the comment's text (round 3, `undirected` finding 1).
    ["local t = {}\n  local b = (t): --[=========[a]b]=========] end", "end"],
    ["local t = {}\n  local b = t: --[=========[a]b]=========] end", "end"],
    ["local x: T: --[=========[a]b]=========] end", "end"],
    ["local x: T | : --[=========[a]b]=========] end", "end"],
    ["local t = {}\n  local b = (t): --[=========[a]==========]b]=========] end", "end"],
    // A number or a boolean before the `:` (round 1, `undirected` finding 3).
    ["local b = 1: --[=========[c]=========] end", "end"],
    ["local b = true: --[=========[c]=========] end", "end"],
    ["local b = nil: --[=========[c]=========] end", "end"],
    // A name past the comment is the method's too, whose call follows.
    ["local t = {}\n  local b = t :: T: --[=========[c]=========] foo()", null],
  ],
  "well-formed code the same rules read": [
    ["for a, b in pairs({}) do end", null],
    ["for k: number, v: string in pairs({}) do end", null],
    ["for k: {a: number}, v: number in pairs({}) do end", null],
    ["for i: number = 1, 3 do end", null],
    ["local t = {}\n  for k, v in pairs(t), t do end", null],
    ["local t = {}\n  local b = (t)\n    :foo()", null],
    ["local t = {}\n  local b = t\n    :foo()", null],
    ["local x: T = 1", null],
    ["local x: number, y: string = 1, 's'", null],
    ["local t = {}\n  local b = (t): --[=========[c]=========] foo()", null],
    ["local t = {}\n  local b = (t): --[=========[a]==========] end ]=========] foo()", null],
    ["local x: nil", null],
    ["local g = function(a: nil): nil return a end", null],
    ["local x: --[=========[c]=========] number", null],
    ["for k: --[=========[c]=========] number in pairs({}) do end", null],
    ["local function f(a: --[=========[c]=========] number) end", null],
  ],
  // A comment of level nine or more that closes on a later line: a reserved
  // word after it is past the `:`'s line, so no method's name, and it closes
  // the block it closes in Luau (round 2, `gb` finding 2).
  "a long comment that closes on a later line": [
    ["local t = {}\n  if t: --[=========[c\n  ]=========] end", null],
    ["local t = {}\n  local b = (t): --[=========[c\n  ]=========] end", null, "local t = {}\n  local b = (t): --[=========[c\n  ]=========] end"],
    ["local t = {}\n  local b = t: --[=========[c\n  ]=========] end", null, "local t = {}\n  local b = t: --[=========[c\n  ]=========] end"],
    // A `:` and a close of another level in the comment's text are no line
    // of the `:` (round 2, `undirected` finding 1).
    ["local t = {}\n  local b = (t): --[=========[a\n  : --[[c ]=========] end", null, "local t = {}\n  local b = (t): --[=========[a\n  : --[[c ]=========] end"],
    ["local t = {}\n  local b = t: --[=========[a\n  : --[[c ]=========] end", null, "local t = {}\n  local b = t: --[=========[a\n  : --[[c ]=========] end"],
  ],
  // A `:` that is a type's is no method's: a declaration's or a `for`
  // variable's annotation, which misses its type, as Luau reads it, so the
  // word is no method's name and `end` closes the function there.
  "a type's colon": [
    ["local x: end", null, "local x: end"],
    ["local x:end", null, "local x:end"],
    ["local x: --[=========[c]=========] end", null, "local x: --[=========[c]=========] end"],
    ["local x\n  : end", null, "local x\n  : end"],
    ["local a, b: end", null, "local a, b: end"],
    ["local a: T, b: end", null, "local a: T, b: end"],
    ["local a: {x: T, y: U}, b: end", null, "local a: {x: T, y: U}, b: end"],
    ["local function f(a: {x: T}, b: end) end", null, "local function f(a: {x: T}, b: end) end"],
    ["for k: in pairs({}) do end", null],
    ["for k: {a: number}, v: in pairs({}) do end", null],
    ["for k\n  : in pairs({}) do end", null],
    ["local function f():end", null],
  ],
};

describe("a reserved word read as a method's name (I-1467)", () => {
  for (const [name, forms] of Object.entries(CASES)) {
    describe(name, () => {
      for (const [form, word, closesAt] of forms) {
        const luau = `${HEADER}${form}${FOOTER}`;
        const text = `${luau}${STORY}`;
        const official = officialErrorList(luau);
        test(`${JSON.stringify(form)}: the function ends where Luau ends it`, () => {
          const tree = stripAnsi(dumpTree(text));
          expect(tree, tree).not.toContain("ERROR_INCOMPLETE");
          const fn = parseSource(text).topNode.firstChild!;
          const end = closesAt === undefined ? luau.length - 1 : HEADER.length + closesAt.length;
          expect([fn.name, fn.from, fn.to], tree).toEqual(["LuauFunctionDefinition", 0, end]);
          if (closesAt !== undefined) return;
          const story = topLevelAt(text, luau.length);
          const control = topLevelAt(`${HEADER}x = 1${FOOTER}${STORY}`, `${HEADER}x = 1${FOOTER}`.length);
          expect([story?.name, story?.from]).toEqual([control?.name, luau.length]);
        });
        test(`${JSON.stringify(form)}: Luau's errors at Luau's ranges`, () => {
          if (word === null) {
            if (name.startsWith("well-formed")) expect(official).toEqual([]);
          } else {
            expect(official.some((e) => e.endsWith(METHOD_NAME(word))), official.join("\n")).toBe(true);
          }
          expect(errorsOf(newCompiler(text)), stripAnsi(dumpTree(text))).toEqual(official);
        });
        test(`${JSON.stringify(form)}: engines agree`, async () => {
          const result = await compareEnginesFull(text);
          expect(result.divergences, formatDivergences(text, result.divergences)).toEqual([]);
        });
        test(`${JSON.stringify(form)}: an incremental compile reports what a cold one does`, () => {
          expectIncrementalEqualsCold(text);
        });
      }
    });
  }
});
