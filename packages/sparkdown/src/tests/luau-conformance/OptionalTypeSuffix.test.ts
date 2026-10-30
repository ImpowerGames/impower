import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic, expectLuauSyntax } from "./typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";

function nodeNamesAt(source: string, from: number, length: number): string[] {
  const tree = parseSource(source);
  const names: string[] = [];
  const cur = tree.cursor();
  do {
    if (cur.from === from && cur.to === from + length) names.push(cur.name.replace(/_c\d+$/, ""));
  } while (cur.next());
  return names;
}

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
    ["an optional array element", "local t: { number? } = {}\n"],
    ["an optional array element after a comment", "local t: { --[[c]] number? } = {}\n"],
    ["a block comment between a function return type and the `?`","type F = () -> number --[[c]]?\nlocal y = 1\n"],
  ])("an optional type before %s parses", (_name, snippet) => {
    expect(checkLuau(`\n${snippet}`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  test.each([
    ["a block comment before its type", "type T = --[[c]] number\nlocal y = 1\n"],
    ["a block comment before an optional type", "type T = --[[c]] number?\nlocal y = 1\n"],
    ["a block comment before a table type", "type T = --[[c]] { number }\nlocal y = 1\n"],
    ["a line comment before a type on the next line", "type T = -- c\n  number\nlocal y = 1\n"],
    ["an export and a block comment before an optional type", "export type T = --[[c]] number?\nlocal y = 1\n"],
  ])("a type alias with %s after its `=` parses", (_name, snippet) => {
    expect(checkLuau(`\n${snippet}`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  test.each([
    ["after a leading bar", "type Bar = |?\n", 12, 13],
    ["alone", "type Baz = ?\n", 10, 12],
    ["before its type", "local v: ?number\n", 8, 10],
    ["after a function arrow", "type F = () -> ?\n", 14, 16],
    ["after an unspaced function arrow", "type F = () ->?\n", 14, 15],
    ["after a function arrow and a block comment", "type F = () -> --[[c]] ?\n", 14, 24],
    ["after a function arrow and two block comments", "type F = () -> --[[a]] --[=[b]=]?\n", 14, 33],
    ["after an annotation's `:` and a block comment", "local v: --[[c]]?\n", 8, 17],
    ["after a type alias's `=` and a block comment", "type T = --[[c]] ?\n", 8, 18],
    ["after an exported type alias's `=` and a block comment", "export type T = --[[c]] ?\n", 15, 25],
  ])("a `?` with no type before it, %s, is reported", (_name, snippet, from, to) => {
    expectLuauSyntax(`\n${snippet}`, [`1:${from}-1:${to} SyntaxError: Expected type, got '?'`]);
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
    ["a local", `function f()\n  local v: number?\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a local and a blank line", `function f()\n  local v: number?\n\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a local with a statement on the same line", `function f()\n  local v: number? return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a type alias with a statement on the same line", `function f()\n  type T = number? return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a return type", `function f(): number?\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a return type and a blank line", `function f(): number?\n\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a return type with its body on the same line", `function f(): number? return 5 end\nscene start\n  Value {f()}.\nend\n`],
    ["an optional table return type", `function f(): {number}?\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["an optional return type in a union", `function f(): number? | string\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a table return type", `function f(): {number}\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a generic return type", `function f(): Array<number>\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a string literal return type", `function f(): "x"\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a single-quoted string literal return type", `function f(): 'x'\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a parenthesized return type", `function f(): (number)\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a type alias", `function f()\n  type T = number?\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
  ])("after %s", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });

  test.each([["type Bar = |?"], ["type Baz = ?"], ["local _v: ?number"]])(
    "after `%s`, which is reported, the rest of the function still runs",
    (line) => {
      const ctx = makeRuntimeStoryFromSource(`function f()\n  ${line}\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`);
      expect(ctx.errorMessages).toContain("Expected type, got '?'");
      expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
    },
  );

  test("a local declared after one with an optional type stays local", () => {
    const ctx = makeRuntimeStoryFromSource(
      `function f()\n  local _v: number?\n  local s = 7\n  return s\nend\nscene start\n  Value {f()} {s}.\nend\n`,
    );
    expect(ctx.story.ContinueMaximally()).toBe("Value 7 nil.\n");
  });

  test.each([
    ["a local", `scene start\n  Before.\n  -> after\nend\nfunction f()\n  local _v: number?\nend\nscene after\n  After.\nend\n`],
    ["a return type", `scene start\n  Before.\n  -> after\nend\nfunction f(): number?\nend\nscene after\n  After.\nend\n`],
    ["a type alias", `scene start\n  Before.\n  -> after\nend\nfunction f()\n  type T = number?\nend\nscene after\n  After.\nend\n`],
  ])("the text after a function ending in %s stays prose", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Before.\nAfter.\n");
  });
});

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
    ["a local", `function f()\n  local v: number ? = 5\n  return v\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a local whose value follows the `?` directly", `function f()\n  local v: number ?= 5\n  return v\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a named type", `function f()\n  local v: Foo ? = 5\n  return v\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a qualified type", `function f()\n  local v: Foo.Bar ? = 5\n  return v\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a block comment before the `?`", `function f()\n  local v: number --[[c]] ? = 5\n  return v\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a type alias", `function f()\n  type T = number ?\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a return type", `function f(): number ?\n  return 5\nend\nscene start\n  Value {f()}.\nend\n`],
    ["a union", `function f()\n  local v: number ? | string = 5\n  return v\nend\nscene start\n  Value {f()}.\nend\n`],
  ])("the code after %s still runs", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });

  test("the text after a spaced optional type in a scene stays prose", () => {
    const ctx = makeRuntimeStoryFromSource(
      `scene start\n  Before.\n  local w: number ?\n  After.\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Before.\nAfter.\n");
  });
});
