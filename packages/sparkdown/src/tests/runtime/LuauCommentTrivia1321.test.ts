import { describe, expect, test } from "vitest";
import { parseSource } from "../compiler/grammarSnapshot";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

// A Luau comment is trivia at every position (I-1321): it does not end a
// value, end a type, turn a modifier into a variable, or play as story text.

function play(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  const lines: string[] = [];
  for (let i = 0; i < 5 && ctx.story.canContinue; i++) {
    lines.push(ctx.story.Continue() ?? "");
  }
  return {
    lines,
    errors: ctx.errorMessages,
    warnings: ctx.warningMessages,
  };
}

/** The names of the top-level nodes of a document, without line breaks. */
function topLevel(source: string): string[] {
  const names: string[] = [];
  for (
    let node = parseSource(source).topNode.firstChild;
    node;
    node = node.nextSibling
  ) {
    if (node.name !== "Newline") names.push(node.name);
  }
  return names;
}

// I-1305: a block comment between a scope modifier and `function`.
describe("a comment between a modifier and `function` keeps the function", () => {
  test.each([
    ["local", "local", "local --[[c]]"],
    ["attribute and local", "@native local", "@native local --[[c]]"],
    ["two comments", "local", "local --[[a]] --[=[b]=]"],
    ["a level-four comment", "local", "local --[====[ helper ]====]"],
    ["a level-four comment holding `]`", "local", "local --[====[a ] b]]c]=]d]====]"],
    ["a level-four comment holding a level-five close", "local", "local --[====[a]=====]b]====]"],
    ["a level-five comment holding a level-four close", "local", "local --[=====[a]====]b]=====]"],
    ["a level-nine comment holding a level-four close", "local", "local --[=========[a]====]b]=========]"],
  ])("%s", (_name, plain, commented) => {
    for (const head of [plain, commented]) {
      const source = `${head} function k(x: number)\n  return x\nend\nValue {k(5)}.\n`;
      const result = play(source);
      expect(result.lines[0], head).toBe("Value 5.\n");
      expect(result.errors, head).toEqual([]);
    }
  });

  test("inside a function", () => {
    const source =
      "function f()\n  local --[[c]] function k(x: number)\n    return x\n  end\n  return k(5)\nend\nValue {f()}.\n";
    const result = play(source);
    expect(result.lines[0]).toBe("Value 5.\n");
    expect(result.errors).toEqual([]);
  });
});

// I-1298: comments between `=` and a value that begins with a statement word.
describe("comments between `=` and a value are not a value", () => {
  test.each([
    ["twoIf", "--[[ c ]] --[[ d ]] if c then\n    1\n  else 2", "w", "1"],
    ["oneIf", "--[[ c ]] if c then\n    1\n  else 2", "w", "1"],
    ["twoPlain", "--[[ c ]] --[[ d ]] 5", "w", "5"],
    ["twoFn", "--[[ a ]] --[[ b ]] function() return 1 end", "w()", "1"],
    ["oneFn", "--[[ a ]] function() return 1 end", "w()", "1"],
    ["threeIf", "--[[ c ]] --[[ d ]] --[==[ e ]==] if c then 1 else 2", "w", "1"],
    ["levelFourIf", "--[====[ c ]====] --[[ d ]] if c then 1 else 2", "w", "1"],
    ["levelFiveBracketIf", "--[=====[a ] b]=====] --[[ d ]] if c then 1 else 2", "w", "1"],
  ])("%s", (_name, value, read, expected) => {
    const source = `function f(c)\n  local w = ${value}\n  return ${read}\nend\nValue {f(true)}.\n`;
    const result = play(source);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toBe(`Value ${expected}.\n`);
  });

  // The comments are no part of the operator: `=` stays a plain `=`, so a
  // list of targets keeps its assignment (validateAssignmentValue reads the
  // operator's own token).
  test("a multiple assignment", () => {
    const source =
      "function f()\n  local a, w = 0, 0\n  a, w = --[[ c ]] --[[ d ]] 1, 2\n  return a + w\nend\nValue {f()}.\n";
    const result = play(source);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toBe("Value 3.\n");
  });

  test("an assignment", () => {
    const source =
      "function f(c)\n  local w = 0\n  w = --[[ c ]] --[[ d ]] if c then 1 else 2\n  return w\nend\nValue {f(true)}.\n";
    const result = play(source);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toBe("Value 1.\n");
  });

  // At story scope the declaration ended between the comments (#1298); a
  // comment of any level counts, closing at its own level.
  test.each([
    ["local", "--[[ c ]] --[[ d ]]"],
    ["store", "--[[ c ]] --[[ d ]]"],
    ["store", "--[====[a ] b]====] --[[ d ]]"],
    ["store", "--[====[a]=====]b]====] --[[ d ]]"],
    ["store", "--[=====[a]====]b]=====] --[[ d ]]"],
  ])("a story-scope `%s` declaration with `%s`", (modifier, comments) => {
    const result = play(
      `${modifier} w = ${comments} if true then 1 else 2\nValue {w}.\n`,
    );
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toBe("Value 1.\n");
  });
});

// I-1299: a comment after a type operator, `:` or a type's `=`, before the
// type, compiles as the type without it.
// The same at story scope, where a statement's type ends at its line.
describe("a comment after a type operator in a story statement keeps the type", () => {
  test.each([
    ["an annotation", "local id: --[[c]] <T>(T) -> T = function(x) return x end", "Value {id(5)}."],
    ["a return type's arrow", "local id: () -> --[[c]] <T>(T) -> T = function() return function(x) return x end end", "Value {id()(5)}."],
    ["a foreign close", "local id: --[====[a]=====]b]====] <T>(T) -> T = function(x) return x end", "Value {id(5)}."],
    ["a union", "local w: number | --[[c]] string = 5", "Value {w}."],
    ["a plain annotation", "local w: --[[c]] number = 5", "Value {w}."],
    ["a type alias", "type F = --[[c]] <T>(T) -> T\nlocal id: F = function(x) return x end", "Value {id(5)}."],
    ["a type alias's arrow", "type F = () -> --[[c]] <T>(T) -> T\nlocal id: F = function() return function(x) return x end end", "Value {id()(5)}."],
  ])("%s", (_name, declaration, line) => {
    const result = play(`${declaration}\n${line}\n`);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toBe("Value 5.\n");
  });
});

describe("a comment after a type operator keeps the type", () => {
  test.each([
    ["an alias", "  type F = () -> --[[c]] <T>(T) -> T\n  local id: F = function(v) return v end\n  local w = id(5)"],
    ["a generic alias", "  type F = --[[c]] <T>(T) -> T\n  local id: F = function(v) return v end\n  local w = id(5)"],
    ["an annotation", "  local id: --[[c]] <T>(T) -> T = function(v) return v end\n  local w = id(5)"],
    ["a return type", "  local id = function(): --[[c]] <T>(T) -> T return function(v) return v end end\n  local w = id()(5)"],
    ["a union", "  local w: number | --[[c]] string = 5"],
    ["a plain alias", "  type K = --[[c]] number\n  local w: K = 5"],
    // A comment holding the close of another level closes at its own.
    ["an alias, foreign close", "  type F = () -> --[====[a]=====]b]====] <T>(T) -> T\n  local id: F = function(v) return v end\n  local w = id(5)"],
    ["a generic alias, foreign close", "  type F = --[====[a]=====]b]====] <T>(T) -> T\n  local id: F = function(v) return v end\n  local w = id(5)"],
    ["an annotation, foreign close", "  local id: --[====[a]=====]b]====] <T>(T) -> T = function(v) return v end\n  local w = id(5)"],
    ["a return type, foreign close", "  local id = function(): --[====[a]=====]b]====] <T>(T) -> T return function(v) return v end end\n  local w = id()(5)"],
  ])("%s", (_name, body) => {
    const result = play(`function f()\n${body}\n  return w\nend\nValue {f()}.\n`);
    expect(result.errors).toEqual([]);
    expect(result.lines[0]).toBe("Value 5.\n");
  });
});

// I-1314: a comment after a block's closing `end` on the same line belongs to
// the block, so nothing is displayed for it.
describe("a comment after a closing `end` at story scope is not story text", () => {
  const blocks: [string, string, string][] = [
    ["a function", "function m() return 1 end", "Values {m()}."],
    [
      "a nested definition",
      "function m() local function n() return 1 end return n() end",
      "Values {m()}.",
    ],
    ["an if block", "local x = 0\nif true then x = 1 end", "Values {x}."],
    ["a do block", "local x = 0\ndo x = 1 end", "Values {x}."],
    [
      "a while block",
      "local x = 0\nwhile x < 1 do x = x + 1 end",
      "Values {x}.",
    ],
    ["a for block", "local x = 0\nfor i = 1, 1 do x = i end", "Values {x}."],
    ["an `&` do line", "local x = 0\n& do x = 1 end", "Values {x}."],
    [
      "a multi-line function",
      "function m()\n  return 1\nend",
      "Values {m()}.",
    ],
    [
      "a define",
      'define O as companion with\n  name = "Orion"\nend',
      "Values 1.",
    ],
    [
      "a cycle in a scene",
      "-> main\nscene main\n  cycle\n    | Values 1.\n  end",
      "end",
    ],
  ];
  for (const comment of ["--[[ c ]]", "-- c", "--[[ a ]] --[=[ b ]=] -- c", "--[====[ c ]====]", "--[====[a ] b]====]", "--[====[a]=====]b]====]"]) {
    test.each(blocks)(`%s, then \`${comment}\``, (_name, block, line) => {
      const controlSource = `${block}\n${line}\n`;
      const control = play(controlSource);
      expect(control.lines[0]).toBe("Values 1.\n");
      expect(control.errors).toEqual([]);
      const source = `${block} ${comment}\n${line}\n`;
      const result = play(source);
      expect(result.lines).toEqual(control.lines);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual(control.warnings);
      // The story line is the only `ImplicitAction`, as without the comment.
      expect(topLevel(source)).toEqual(topLevel(controlSource));
    });
  }
});
