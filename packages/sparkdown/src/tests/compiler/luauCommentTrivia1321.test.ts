// A Luau comment is trivia at every position (I-1321). A block comment
// between a function type's `->` and a generic function type it returns
// keeps the type whole (I-1299), and a comment after a closing `end` at story
// scope belongs to the block it follows (I-1314).
import { afterEach, describe, expect, test, vi } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialSyntaxErrors } from "./officialSyntax";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

afterEach(() => {
  vi.restoreAllMocks();
});

const URI = "inmemory:///main.sd";

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

/** The official parser's errors for the same Luau, in the same form. */
function luauErrors(luau: string): string[] {
  return officialSyntaxErrors(luau)
    .map((e) => `${e.location.begin.line}:${e.location.begin.column}-${e.location.end.line}:${e.location.end.column} ${e.message}`)
    .sort();
}

/** The tree of a document and the parser's empty-match warnings. */
function read(source: string) {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const tree = stripAnsi(dumpTree(source));
  const emptyMatches = warn.mock.calls.filter((args) =>
    args.some((a) => String(a).includes("empty match")),
  ).length;
  warn.mockRestore();
  return { tree, emptyMatches };
}

describe("a comment after a function type's `->` keeps the type", () => {
  test.each([
    "() -> --[[c]] <T>(T) -> T",
    "() -> --[[c]] <T>",
    "() -> <T>(T) -> T",
    "() -> --[[c]] (T) -> T",
    "() -> --[[c]] number",
    "() -> --[[c]] {T}",
    "() -> --[[a]] --[[b]] <T>(T) -> T",
    "(number) -> --[==[c]==] <T, U...>(T) -> U...",
    "() -> --[====[a ] b]====] <T>(T) -> T",
    "() -> --[====[a]=====]b]====] <T>(T) -> T",
    "--[=====[a]====]b]=====] <T>(T) -> T",
  ])("type F = %s", (type) => {
    const { tree, emptyMatches } = read(
      `function g()\n  type F = ${type}\nend\n`,
    );
    expect(tree, tree).not.toContain("ERROR_INCOMPLETE");
    expect(emptyMatches).toBe(0);
  });

  // After a `:` or a type's `=`, a comment before a generic function type
  // is trivia too.
  test.each([
    "function g()\n  local f = function(): --[[c]] <T>(T) -> T end\nend\n",
    "function g()\n  local f: --[[c]] <T>(T) -> T = nil\nend\n",
    "function g()\n  type F = --[[c]] <T>(T) -> T\nend\n",
    "function g(): --[[c]] <T>(T) -> T\nend\n",
  ])("%s", (source) => {
    const { tree, emptyMatches } = read(source);
    expect(tree, tree).not.toContain("ERROR_INCOMPLETE");
    expect(emptyMatches).toBe(0);
  });

  // `<` after a complete type is a comparison, so the type ends before it,
  // with or without a comment between.
  test.each([
    "x :: {} < y",
    "x :: {} --[[c]] < y",
    "f :: () -> {} < y",
    "f :: () -> {} --[[c]] < y",
    "f :: () -> --[[c]] {} --[[d]] < y",
  ])("a comparison after a complete type ends the type: %s", (value) => {
    const { tree, emptyMatches } = read(
      `function g(x, f, y)\n  local b = ${value}\nend\n`,
    );
    expect(tree, tree).not.toContain("ERROR_INCOMPLETE");
    expect(emptyMatches).toBe(0);
    expect(tree, tree).toContain("LuauCompareOperation");
    expect(tree, tree).not.toContain("PunctuationAngleOpen");
  });
});

// The comments after an `=` are the operator's, but an error placed on the
// operator stays on its own token, as Luau places it, with or without them.
describe("an error at an assignment's operator keeps its range", () => {
  test.each([
    "local w = --[[ c ]] ;",
    "local w = --[====[ c ]====] ;",
    "local a, b = 1, 2\n  a, b += --[[ c ]] 1",
  ])("%s", (statement) => {
    const luau = `function f()\n  ${statement}\nend\n`;
    expect(sparkdownErrors(`${luau}Story.\n`)).toEqual(luauErrors(luau));
  });
});

// Many spaced comments that the position cannot take (code follows them, or
// no `function`) are read in time linear in their number: each comment owns
// only the whitespace after it, so a failing match has one split to try.
describe("many comments before a failing suffix parse quickly", () => {
  const comments = "--[[a]]    ".repeat(30);
  test.each([
    ["after `end`", `function f() end ${comments}Text.\n`],
    ["after a scope modifier", `function g()\n  local ${comments}x = 1\nend\n`],
    ["after an assignment operator", `function g()\n  local x = ${comments}\nend\n`],
    ["after a type operator", `function g()\n  type F = () -> ${comments}number\nend\n`],
  ])("%s", (_name, source) => {
    const started = performance.now();
    parseSource(source);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});

describe("a comment after a closing `end` at story scope belongs to its block", () => {
  test.each([
    ["function m() return 1 end", "LuauFunctionDefinition"],
    ["function m() local function n() return 1 end return n() end", "LuauFunctionDefinition"],
    ["local function m() return 1 end", "LuauFunctionDefinition"],
  ])("%s", (block, name) => {
    for (const comment of [" --[[ c ]]", " -- c", "--[[ c ]]", " --[==[ c ]==]"]) {
      const source = `${block}${comment}\nValues {m()}.\n`;
      const top = parseSource(source).topNode.firstChild!;
      expect(top.name, comment).toBe(name);
      expect([top.from, top.to], comment).toEqual([0, block.length + comment.length]);
    }
  });
});
