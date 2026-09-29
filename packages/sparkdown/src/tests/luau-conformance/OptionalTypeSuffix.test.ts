import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";

// In Luau `?` is a postfix suffix that ends the optional type it follows
// (`number?`). It takes no right operand, so the word after it, on the same
// line or the next, is never read as part of the type.

/**
 * Every rule name the grammar gives to the text starting at `from` with length
 * `length`, without the `_c<N>` suffix a capture node carries.
 */
function nodeNamesAt(source: string, from: number, length: number): string[] {
  const tree = parseSource(source);
  const names: string[] = [];
  const cur = tree.cursor();
  do {
    if (cur.from === from && cur.to === from + length) names.push(cur.name.replace(/_c\d+$/, ""));
  } while (cur.next());
  return names;
}

/** The furthest end of any node that starts at `from`. */
function furthestEndFrom(source: string, from: number): number {
  const tree = parseSource(source);
  let end = from;
  const cur = tree.cursor();
  do {
    if (cur.from === from) end = Math.max(end, cur.to);
  } while (cur.next());
  return end;
}

const DECLARATIONS = [
  ["local v: number?", (body: string) => `function w()\n  local v: number?\n${body}end\n`],
  ["function w(): number?", (body: string) => `function w(): number?\n${body}end\n`],
  ["type T = number?", (body: string) => `function w()\n  type T = number?\n${body}end\n`],
] as const;

const FOLLOWERS = [
  ["a statement", "  return 5\n", "return"],
  ["a blank line and a statement", "\n  local s = 1\n", "local"],
  ["the enclosing block's end", "", "end"],
] as const;

const CASES = DECLARATIONS.flatMap(([declaration, wrap]) =>
  FOLLOWERS.map(([follower, body, word]) => [declaration, follower, wrap(body), word] as const),
);

describe("a type ending in `?` ends at the `?`", () => {
  test.each(CASES)("%s followed by %s", (_declaration, _follower, source, word) => {
    const question = source.indexOf("?");
    const wordFrom = source.indexOf(word, question);
    expect(furthestEndFrom(source, question)).toBe(question + 1);
    expect(nodeNamesAt(source, wordFrom, word.length)).not.toContain("LuauTypeName");
    expect(nodeNamesAt(source, question, 1)).toContain("LuauTypeOptionalOperator");
    expect(checkLuau(`\n${source}`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  test.each([
    ["a value", "local v: number? = 1\n"],
    ["a spaced union", "local v: number? | string = 1\n"],
    ["an unspaced union", "local v: number?|string = 1\n"],
    ["another declaration", "local a: number?, b: string?\n"],
    ["a closing parenthesis", "local function f(x: number?) end\n"],
    ["a closing brace", "local v: {a: number?} = {}\n"],
    ["a table type", "local v: {number}?\nlocal s = 1\n"],
    ["a function type", "local v: () -> number?\nlocal s = 1\n"],
    ["a generic type", "local v: Array<number>?\nlocal s = 1\n"],
    ["a generic function return", "local v: () -> Array<number>?\nlocal s = 1\n"],
    ["a trailing comment", "type T = number? -- a comment\nlocal y = 1\n"],
    ["a block comment between the type and the `?`", "type T = number --[[c]] ?\nlocal y = 1\n"],
    ["a block comment between a function return type and the `?`", "type F = () -> number --[[c]]?\nlocal y = 1\n"],
  ])("an optional type before %s parses", (_name, snippet) => {
    expect(checkLuau(`\n${snippet}`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  // Luau rejects each of these: a `?` only ends the type before it. The `?` is
  // reported in Luau's wording, and nothing else is, so the rest reads as Luau.
  test.each([
    ["after a leading bar", "type Bar = |?\n", 12],
    ["alone", "type Baz = ?\n", 11],
    ["before its type", "local v: ?number\n", 9],
    ["after a function arrow", "type F = () -> ?\n", 15],
    ["after an unspaced function arrow", "type F = () ->?\n", 14],
    ["after a function arrow and a block comment", "type F = () -> --[[c]] ?\n", 23],
    ["after a function arrow and two block comments", "type F = () -> --[[a]] --[=[b]=]?\n", 32],
    ["after an annotation's `:` and a block comment", "local v: --[[c]]?\n", 16],
  ])("a `?` with no type before it, %s, is reported", (_name, snippet, column) => {
    expect(checkLuau(`\n${snippet}`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([
      `1:${column}-1:${column + 1} SyntaxError: Expected type, got '?'`,
    ]);
  });

  test.each([
    ["a spaced union", "local v: number? | string = 1\n"],
    ["an unspaced union", "local v: number?|string = 1\n"],
  ])("the type after `?` in %s is still a type", (_name, source) => {
    const from = source.indexOf("string");
    expect(nodeNamesAt(source, from, "string".length)).toContain("LuauPrimitiveType");
  });
});

describe("the code after a type ending in `?` still runs", () => {
  test.each([
    ["a local", `Value {f()}.\nfunction f()\n  local v: number?\n  return 5\nend\n`],
    ["a local and a blank line", `Value {f()}.\nfunction f()\n  local v: number?\n\n  return 5\nend\n`],
    ["a local with a statement on the same line", `Value {f()}.\nfunction f()\n  local v: number? return 5\nend\n`],
    ["a type alias with a statement on the same line", `Value {f()}.\nfunction f()\n  type T = number? return 5\nend\n`],
    ["a return type", `Value {f()}.\nfunction f(): number?\n  return 5\nend\n`],
    ["a return type and a blank line", `Value {f()}.\nfunction f(): number?\n\n  return 5\nend\n`],
    ["a return type with its body on the same line", `Value {f()}.\nfunction f(): number? return 5 end\n`],
    ["an optional table return type", `Value {f()}.\nfunction f(): {number}?\n  return 5\nend\n`],
    ["an optional return type in a union", `Value {f()}.\nfunction f(): number? | string\n  return 5\nend\n`],
    ["a table return type", `Value {f()}.\nfunction f(): {number}\n  return 5\nend\n`],
    ["a generic return type", `Value {f()}.\nfunction f(): Array<number>\n  return 5\nend\n`],
    ["a string literal return type", `Value {f()}.\nfunction f(): "x"\n  return 5\nend\n`],
    ["a single-quoted string literal return type", `Value {f()}.\nfunction f(): 'x'\n  return 5\nend\n`],
    ["a parenthesized return type", `Value {f()}.\nfunction f(): (number)\n  return 5\nend\n`],
    ["a type alias", `Value {f()}.\nfunction f()\n  type T = number?\n  return 5\nend\n`],
  ])("after %s", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });

  test.each([["type Bar = |?"], ["type Baz = ?"], ["local _v: ?number"]])(
    "after `%s`, which is reported, the rest of the function still runs",
    (line) => {
      const ctx = makeRuntimeStoryFromSource(`Value {f()}.\nfunction f()\n  ${line}\n  return 5\nend\n`);
      expect(ctx.errorMessages).toEqual(["Expected type, got '?'"]);
      expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
    },
  );

  test("a local declared after one with an optional type stays local", () => {
    const ctx = makeRuntimeStoryFromSource(
      `Value {f()} {s}.\nfunction f()\n  local _v: number?\n  local s = 7\n  return s\nend\n`,
    );
    expect(ctx.story.ContinueMaximally()).toBe("Value 7 nil.\n");
  });

  test.each([
    ["a local", `Before.\nfunction f()\n  local _v: number?\nend\nAfter.\n`],
    ["a return type", `Before.\nfunction f(): number?\nend\nAfter.\n`],
    ["a type alias", `Before.\nfunction f()\n  type T = number?\nend\nAfter.\n`],
  ])("the text after a function ending in %s stays prose", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Before.\nAfter.\n");
  });
});

// Luau accepts whitespace before the `?` suffix, and scripts formatted before
// #1065 contain `number ?` and `number ?= 1`, so a space before the `?` must
// keep reading as Luau rather than turning the line into story text.
describe("a space before the `?` suffix still reads as Luau", () => {
  test.each([
    ["a spaced local with a value", "local v: number ? = 1\n"],
    ["a local whose value follows the `?` directly", "local v: number ?= 1\n"],
    ["a spaced local", "local v: number ?\nlocal s = 1\n"],
    ["a spaced named type", "local v: Foo ? = nil\n"],
    ["a spaced qualified name", "local v: Foo.Bar ? = nil\n"],
    ["a block comment before the `?`", "local v: number --[[c]] ? = 1\n"],
    ["a long block comment before the `?`", "local v: number --[=[c]=] ? = 1\n"],
    ["a block comment glued to the `?`", "local v: number --[[c]]? = 1\n"],
    ["a spaced table type", "local v: {number} ? = nil\n"],
    ["a spaced union", "local v: number ? | string = 1\n"],
    ["a spaced type alias", "type T = number ?\nlocal s = 1\n"],
    ["a spaced return type", "function f(): number ?\nend\n"],
  ])("%s parses", (_name, snippet) => {
    expect(checkLuau(`\n${snippet}`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  test.each([
    ["a local", `Value {f()}.\nfunction f()\n  local v: number ? = 5\n  return v\nend\n`],
    ["a local whose value follows the `?` directly", `Value {f()}.\nfunction f()\n  local v: number ?= 5\n  return v\nend\n`],
    ["a named type", `Value {f()}.\nfunction f()\n  local v: Foo ? = 5\n  return v\nend\n`],
    ["a qualified type", `Value {f()}.\nfunction f()\n  local v: Foo.Bar ? = 5\n  return v\nend\n`],
    ["a block comment before the `?`", `Value {f()}.\nfunction f()\n  local v: number --[[c]] ? = 5\n  return v\nend\n`],
    ["a type alias", `Value {f()}.\nfunction f()\n  type T = number ?\n  return 5\nend\n`],
    ["a return type", `Value {f()}.\nfunction f(): number ?\n  return 5\nend\n`],
    ["a union", `Value {f()}.\nfunction f()\n  local v: number ? | string = 5\n  return v\nend\n`],
  ])("the code after %s still runs", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });

  test("the text after a spaced top-level optional type stays prose", () => {
    const ctx = makeRuntimeStoryFromSource(`Before.\nlocal w: number ?\nAfter.\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Before.\nAfter.\n");
  });
});
