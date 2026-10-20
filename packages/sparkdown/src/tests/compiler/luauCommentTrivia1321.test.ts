// A Luau comment is trivia at every position (I-1321). A block comment
// between a function type's `->` and a generic function type it returns
// keeps the type whole (I-1299), and a comment after a closing `end` at story
// scope belongs to the block it follows (I-1314).
import { afterEach, describe, expect, test, vi } from "vitest";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";

afterEach(() => {
  vi.restoreAllMocks();
});

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
