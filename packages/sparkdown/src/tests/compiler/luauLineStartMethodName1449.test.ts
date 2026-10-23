// A reserved word read as a method's name on the line after its receiver
// (I-1449): `(t)` then `:end`, `f()` then `:function`. Luau reads a line-start
// `:` followed by a reserved word on the `:`'s line as a method's name, except
// after a declaration target or a function header that ends its line and in a
// `for` binding, where the `:` is a type's. Each form stands in a function in
// a `.sd` document with a story line after it. The function ends where Luau
// ends it, the tree holds no `ERROR_INCOMPLETE`, the story line is the
// story's, Sparkdown's syntax errors are the official parser's, message and
// range, both TextMate engines read the form alike, and an incremental
// compile reports what a cold one does.
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
 * where Luau reads none: well-formed code, or a `:` that is a type's).
 * `closesAt` is the form's text up to the `end` that Luau closes the function
 * on, where that is not the function's own.
 */
const CASES: Record<string, [form: string, word: string | null, closesAt?: string][]> = {
  "a reserved word on the line after its receiver": [
    ["local t = {}\n  local b = (t)\n    :end", "end"],
    ["local b = f()\n    :function", "function"],
    ["local t = {}\n  local b = t\n    :end", "end"],
    ["local t = {}\n  local b = (t)\n    : --[[c]] end", "end"],
    ["local t = {}\n  t.a = (t)\n    :end", "end"],
    ["local t = {}\n  return (t)\n    :end", "end"],
    ["local t = {}\n  f(t\n    :end)", "end"],
    ["local t = {}\n  print(t)\n    :end", "end"],
    // Other words that open or close a block, and the access going on.
    ["local t = {}\n  local b = t\n    :if", "if"],
    ["local t = {}\n  local b = t\n    :end()", "end"],
    ["local t = {}\n  local b = (t)\n    :end\n    :foo()", "end"],
    ["local t = {}\n  local b = (t)\n    :end\n  local c = 1", "end"],
    ["local t = {}\n  repeat\n    local b = t\n      :until\n  until t", "until"],
    // Comments and blank lines between the receiver and the `:` line.
    ["local t = {}\n  local b = (t) -- c\n    :end", "end"],
    ["local t = {}\n  local b = (t)\n    -- c\n    :end", "end"],
    ["local t = {}\n  local b = (t)\n\n    :end", "end"],
    ["local t = {}\n  local b = (t)\n    : --[=========[c]=========] end", "end"],
    // In brackets, conditions and blocks.
    ["local t = {}\n  local b = {t\n    :end}", "end"],
    ["local t = {}\n  while t\n    :end do end", "end"],
    ["local t = {}\n  for k in t\n    :end do end", "end"],
    ["local t = {}\n  if t then\n    :end\n  end", "end"],
    // After a statement that ends in no value, or a type: Luau still reads
    // the word as a method's name.
    ["x = 1\n  :end", "end"],
    ["local t = {}\n  local x = t\n  : end", "end"],
    ["local x: T\n  :end", "end"],
    ["local function f(): T\n    :end\n  end", "end"],
    ["local function f(): (number)\n    :end\n  end", "end"],
  ],
  "well-formed code the same rules read": [
    ["local t = {}\n  local b = (t)\n    :foo()", null],
    ["local t = {}\n  local b = t\n    :foo()", null],
    ["local t = {}\n  print(t)\n    :foo()", null],
    ["local t = {}\n  local b = (t)\n    : --[=========[c]=========] foo()", null],
    ["local x\n  : number = 1", null],
    ["local function f()\n    : number\n    return 1\n  end", null],
    ["local x = 1\n  local y\n  print(x)", null],
    ["local function f()\n\n    print(1)\n  end", null],
    ["local function f()\n    -- c\n    print(1)\n  end", null],
  ],
  // A header's `do` or `then` stays the header's, as on base.
  "a header's keyword after a line-start colon": [
    ["local t = {}\n  while t\n    :do end", null],
    ["local t = {}\n  while t\n    : --[=========[c]=========] do end", null],
    ["local t = {}\n  if t\n    : --[=========[c]=========] then end", null],
    ["local t = {}\n  local b = t\n    :do", null],
    ["local t = {}\n  local b = t\n    :then", null],
  ],
  // A `:` that is a type's is no method's: a declaration's annotation, a
  // function's return type or a `for` variable's annotation, which misses
  // its type, as Luau reads it, so the word closes the function there.
  "a type's colon at a line's start": [
    ["local function f()\n    : end\n  end", null, "local function f()\n    : end\n  end"],
    ["local g = function()\n    : end\n  end", null, "local g = function()\n    : end\n  end"],
    ["function f()\n    : end\n  end", null, "function f()\n    : end\n  end"],
    ["local t = {}\n  function t:m()\n    : end\n  end", null, "local t = {}\n  function t:m()\n    : end\n  end"],
    ["local function f() -- c\n    : end\n  end", null, "local function f() -- c\n    : end\n  end"],
    ["local function f() --[[c]]\n    : end\n  end", null, "local function f() --[[c]]\n    : end\n  end"],
    ["local function f()\n    -- c\n    : end\n  end", null, "local function f()\n    -- c\n    : end\n  end"],
    ["local function f()\n    : --[=========[c]=========] end\n  end", null, "local function f()\n    : --[=========[c]=========] end\n  end"],
    ["local function f(a: (number) -> number)\n    : end\n  end", null, "local function f(a: (number) -> number)\n    : end\n  end"],
    ["local x\n  : end", null, "local x\n  : end"],
    ["local a,\n    b\n  : end", null, "local a,\n    b\n  : end"],
    ["local x, y\n  : end", null, "local x, y\n  : end"],
    ["local x -- c\n  : end", null, "local x -- c\n  : end"],
    ["local x --[[c]]\n  : end", null, "local x --[[c]]\n  : end"],
    ["local x\n  -- c\n  : end", null, "local x\n  -- c\n  : end"],
    ["local x\n\n  : end", null, "local x\n\n  : end"],
    ["local x\n  : --[=========[c]=========] end", null, "local x\n  : --[=========[c]=========] end"],
    ["for k\n  : in pairs({}) do end", null],
  ],
};

describe("a reserved word read as a method's name on the line after its receiver (I-1449)", () => {
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
