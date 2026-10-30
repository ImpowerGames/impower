import { describe, expect, test, vi } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";

// As in Luau, a type union may go on to the next line: a line that starts
// with `|` continues the type that ended the line before it, whether or not
// that type ends in `?`. Any other line ends the type. A story declaration
// ends at its line (#1907), so the locals here are in a function body;
// storyBodyLineRule pins the story reading.

const TYPES = [
  ["an optional type", "number?"],
  ["a plain type", "number"],
] as const;

/**
 * Whether the type that starts at the first `type` in `source` is one type
 * node that takes in the next line's `| string` member.
 */
function isOneType(source: string, type: string): boolean {
  const from = source.indexOf(type);
  const member = source.indexOf("| string");
  const cur = parseSource(source).cursor();
  do {
    if (cur.name === "LuauTypeLiteral" && cur.from === from && cur.to >= member + "| string".length) return true;
  } while (cur.next());
  return false;
}

describe("a union that goes on to the next line parses as one type", () => {
  test.each(
    TYPES.flatMap(([name, type]) => [
      [name, "a local", type, `function f()\n  local v: ${type}\n    | string = 1\n  local s = 1\nend\n`],
      [name, "a local, after a blank line", type, `function f()\n  local v: ${type}\n\n    | string = 1\n  local s = 1\nend\n`],
      [name, "a local, over three lines", type, `function f()\n  local v: ${type}\n    | string\n    | boolean = 1\n  local s = 1\nend\n`],
      [name, "a local, unindented", type, `function f()\n  local v: ${type}\n| string = 1\n  local s = 1\nend\n`],
      [name, "a type alias", type, `type T = ${type}\n    | string\nlocal s = 1\n`],
      [name, "an exported type alias", type, `export type T = ${type}\n    | string\nlocal s = 1\n`],
      [name, "a return type", type, `local function f(): ${type}\n    | string\n  return 1\nend\n`],
      [name, "a parameter", type, `local function f(x: ${type}\n    | string)\nend\n`],
      [name, "a table field", type, `type T = {\n  a: ${type}\n    | string,\n  b: number,\n}\n`],
    ]),
  )("after %s, in %s", (_type, _context, type, snippet) => {
    expect(checkLuau(`\n${snippet}`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
    expect(isOneType(snippet, type)).toBe(true);
  });
});

describe("the code after a union that goes on to the next line still runs", () => {
  test.each(
    TYPES.flatMap(([name, type]) => [
      [name, "a local", `scene start\n  Value {f()}.\nend\nfunction f()\n  local _v: ${type}\n    | string\n  return 5\nend\n`],
      [name, "a return type", `scene start\n  Value {f()}.\nend\nfunction f(): ${type}\n    | string\n  return 5\nend\n`],
      [name, "a type alias", `scene start\n  Value {f()}.\nend\nfunction f()\n  type T = ${type}\n    | string\n  return 5\nend\n`],
      [name, "a type function's return type", `scene start\n  Value {f()}.\nend\ntype function tf(t): ${type}\n    | string\n  return t\nend\nfunction f()\n  return 5\nend\n`],
    ]),
  )("after %s, in %s", (_type, _context, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });
});

// A type that ends its line takes the line break in, so each rule around it
// has to end at the start of the next line, indented or not. A local belongs
// in a scene, so the story's locals are written in one.
describe("a type at the end of a line still ends at the next line's code", () => {
  test.each([
    ["a local and prose", `scene start\n  local x: number\n  Hello {f()}.\nend\nfunction f()\n  return 5\nend\n`, "Hello 5.\n"],
    ["a local, a blank line and prose", `scene start\n  local x: number\n\n  Hello {f()}.\nend\nfunction f()\n  return 5\nend\n`, "Hello 5.\n"],
    ["a local and a local function", `scene start\n  local x: number\n  local function f()\n    return 5\n  end\n  Hello {f()}.\nend\n`, "Hello 5.\n"],
    ["a type alias and prose", `type T = number\nscene start\n  Hello {f()}.\nend\nfunction f()\n  return 5\nend\n`, "Hello 5.\n"],
    ["a return type and an unindented body", `scene start\n  Hello {f()}.\nend\nfunction f(): number\nreturn 5\nend\n`, "Hello 5.\n"],
    ["a return type and a call", `scene start\n  Hello {f()}.\nend\nfunction f(): number\n  print(1)\n  return 5\nend\n`, "Hello 15.\n"],
    ["an unindented local and a call", `scene start\n  Hello {f()}.\nend\nfunction f()\nlocal _v: number\nprint(1)\nreturn 5\nend\n`, "Hello 15.\n"],
    ["a local with a value and another local", `scene start\n  Hello {f()}.\nend\nfunction f()\n  local a: number = 2 local b = 3\n  return a + b\nend\n`, "Hello 5.\n"],
  ])("after %s", (_name, source, output) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(output);
  });
});

// The function body opens on the header's line when a statement follows it
// there, so the statements on that line run with the ones after it; a
// declaration's values keep their call arguments.
describe("every statement of a function runs", () => {
  test.each([
    ["a typed local on the header's line", `scene start\n  Value {f()}.\nend\nfunction f() local x: number = 5\n  return x\nend\n`, "Value 5.\n"],
    ["statements separated by semicolons on the header's line", `scene start\n  Value {f(3)}.\nend\nfunction f(n) local x = {}; for i = 1, n do x[i] = i end;\n  return #x\nend\n`, "Value 3.\n"],
    ["call values after a comma", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a, b = math.sqrt(4), math.sqrt(9)\n  return a + b\nend\n`, "Value 5.\n"],
    ["a call in parentheses first on the header's line", `scene start\n  Value {f()}.\nend\nfunction f() (function() print(1) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses first after parameters", `scene start\n  Value {f(1)}.\nend\nfunction f(a) (function() print(a) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses first after a return type ending in `?`", `scene start\n  Value {f()}.\nend\nfunction f(): number? (function() print(1) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses first after a return type ending in a name", `scene start\n  Value {f()}.\nend\nfunction f(): number (function() print(1) end)() return 5 end\n`, "Value 15.\n"],
    ["parameters after a space, then a call in parentheses", `scene start\n  Value {f(1)}.\nend\nfunction f (a) (function() print(a) end)() return 5 end\n`, "Value 15.\n"],
    ["generic parameters after a space, then a call in parentheses", `scene start\n  Value {f(1)}.\nend\nfunction f<T> (a: T) (function() print(a) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses right after the header", `scene start\n  Value {f()}.\nend\nfunction f()(function() print(1) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses right after generic parameters", `scene start\n  Value {f(1)}.\nend\nfunction f<T>(a: T)(function() print(a) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses right after a dotted header", `store t = {}\nfunction t.g()(function() print(1) end)() return 5 end\nscene start\n  Value {t.g()}.\nend\n`, "Value 15.\n"],
    ["a call in parentheses right after a method header", `store t = {}\nfunction t:m()(function() print(1) end)() return 5 end\nscene start\n  Value {t:m()}.\nend\n`, "Value 15.\n"],
    ["a call in parentheses right after an anonymous header", `scene start\n  local f = function()(function() print(1) end)() return 5 end\n  Value {f()}.\nend\n`, "Value 15.\n"],
    ["statements right after the header", `scene start\n  Value {f()}.\nend\nfunction f()local x = 5 return x end\n`, "Value 5.\n"],
    ["a block comment between the header and a statement", `scene start\n  Value {f()}.\nend\nfunction f() --[[c]] print(1) return 5 end\n`, "Value 15.\n"],
  ])("with %s", (_name, source, output) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(output);
  });

  // A `;` ends a statement, so Luau rejects one with no statement before it
  // (#1175); the statements after it still run.
  test.each([
    ["a `;` right after a return type", `scene start\n  Value {f()}.\nend\nfunction f(): number; print(1) return 5 end\n`],
    ["a `;` right after the parameters", `scene start\n  Value {f()}.\nend\nfunction f(); print(1) return 5 end\n`],
  ])("with %s, which Luau rejects", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual(["Expected identifier when parsing expression, got ';'"]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 15.\n");
  });

  // A header ending in a colon has an empty return type, which Luau rejects
  // (#1152); the body still opens at the next line, so its statements run.
  test("with a header ending in a colon, which is reported", () => {
    const ctx = makeRuntimeStoryFromSource(
      `scene start\n  Value {f(4)}.\nend\nfunction f(x):\n  local y = x + 1\n  return y\nend\n`,
    );
    expect(ctx.errorMessages).toEqual(["Expected type, got 'local'"]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });
});

// In Luau code, a type goes on past comments as Luau reads it: a union
// member line after a comment-only line, and code after a block comment
// that ends the type on its line.
describe("a type in Luau code goes on past comments", () => {
  test.each([
    ["a line comment between union members", `scene start\n  Value {f()}.\nend\nfunction f()\n  local _v: number\n  -- note\n  | string\n  return 5\nend\n`],
    ["a block comment line between union members", `scene start\n  Value {f()}.\nend\nfunction f()\n  local _v: number?\n  --[[note]]\n  | string\n  return 5\nend\n`],
    ["a comment line and a blank line between union members", `scene start\n  Value {f()}.\nend\nfunction f()\n  local _v: number\n\n  -- note\n    | string\n    | boolean\n  return 5\nend\n`],
    ["a comment line before a union member with a value", `scene start\n  Value {f()}.\nend\nfunction f()\n  local v: number\n  -- note\n  | string = 5\n  return v\nend\n`],
    // The `=` inside the table type is the type's, not the declaration's.
    ["a comment line before a union member with a value, after a table type", `scene start\n  Value {f()}.\nend\nfunction f()\n  local v: typeof({ k = 1 })\n  -- note\n  | string = { k = 5 }\n  return v.k\nend\n`],
    ["a comment line in a type alias", `scene start\n  Value {f()}.\nend\nfunction f()\n  type T = number\n  -- note\n  | string\n  return 5\nend\n`],
    ["a comment line in a return type", `scene start\n  Value {f()}.\nend\nfunction f(): number\n  -- note\n  | string\n  return 5\nend\n`],
    ["a comment line in a parameter's type", `scene start\n  Value {f(1)}.\nend\nfunction f(x: number\n  -- note\n  | string)\n  return 5\nend\n`],
    ["a block comment and code after a return type", `scene start\n  Value {f()}.\nend\nfunction f(): number --[[c]] return 5 end\n`],
    ["a block comment and code after a continued return type", `scene start\n  Value {f()}.\nend\nfunction f(): number\n  | string --[[c]] return 5 end\n`],
  ])("with %s", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });

  test.each([
    ["a return type", `scene start\n  Value {f()}.\nend\nfunction f(): number --[[c]] print(1) return 5 end\n`],
    ["a typed local", `scene start\n  Value {f()}.\nend\nfunction f()\n  local w: number --[[c]] print(1)\n  return 5\nend\n`],
    ["a typed local, holding a `]`", `scene start\n  Value {f()}.\nend\nfunction f()\n  local w: number --[[a]b]] print(1)\n  return 5\nend\n`],
    ["a typed local, with a level", `scene start\n  Value {f()}.\nend\nfunction f()\n  local w: number --[=[a]b]=] print(1)\n  return 5\nend\n`],
    ["a return type, holding a `]`", `scene start\n  Value {f()}.\nend\nfunction f(): number --[[a]b]] print(1) return 5 end\n`],
  ])("a block comment after %s leaves the call after it a statement", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 15.\n");
  });

  test.each([
    ["a comma", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a, --[[c]] b = 2, 3\n  return a + b\nend\n`],
    ["an `=`", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a: number = --[[c]] 5\n  return a\nend\n`],
    ["a type annotation's `:`", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a: --[[c]] number = 5\n  return a\nend\n`],
  ])("a block comment right after %s leaves the declaration going", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });});

// A `|` line after a comment line that continues no type is Luau's error, and
// its value goes to no declaration.
describe("a union member line that continues no type", () => {
  test.each([
    ["after a call", `scene start\n  Value {f()}.\nend\nfunction f()\n  print(1)\n  -- note\n  | string\n  return 5\nend\n`],
    ["after an untyped local", `scene start\n  Value {f()}.\nend\nfunction f()\n  local v\n  -- note\n  | string = 5\n  return v\nend\n`],
    ["at the start of a function with no return type", `scene start\n  Value {f()}.\nend\nfunction f()\n  | string = print(9)\n  return 5\nend\n`],
  ])("is reported %s", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([expect.stringContaining("continues a type, but the line before it does not end in one")]);
  });
});

// In Luau code a comma that ends its line continues the list on the next
// line, indented or not, unless that line starts a statement.
describe("a value on an unindented line after a trailing comma", () => {
  test.each([
    ["a number", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a, g = 1,\n2\n  return g\nend\n`, "Value 2.\n"],
    ["a call", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a, g = 1,\nmath.max(2, 5)\n  return g\nend\n`, "Value 5.\n"],
    ["two values over two lines", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a, g, b = 1,\n2,\n3\n  return a + g * 10 + b * 100\nend\n`, "Value 321.\n"],
    ["an indented if expression over several lines", `scene start\n  Value {f(true)}.\nend\nfunction f(c)\n  local a, g = 1,\n    if c then\n      2\n    else\n      3\n  return g\nend\n`, "Value 2.\n"],
  ])("is read as %s", (_name, source, output) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(output);
  });

  test("a statement on the unindented line leaves the comma without a value", () => {
    const ctx = makeRuntimeStoryFromSource(`scene start\n  Value {f()}.\nend\nfunction f()\n  local a, g = 1,\nreturn 5\nend\n`);
    expect(ctx.errorMessages).not.toEqual([]);
  });
});

// A declaration goes on across any run of whitespace before a comma or `=`.
describe("a declaration with extra whitespace before a comma or `=`", () => {
  test.each([
    ["two spaces before a comma", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a, b = 2  , 3\n  return a + b\nend\n`],
    ["two spaces before a comma between typed names", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a: number  , b: number = 2, 3\n  return a + b\nend\n`],
    ["two spaces before `=`", `scene start\n  Value {f()}.\nend\nfunction f()\n  local a  = 5\n  return a\nend\n`],
  ])("keeps every value, with %s", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });
});

// A return type takes in its line break, so a `.Name` line after it that
// qualifies the type is the body's first line; it is still part of the type.
describe("a return type qualified on the next line", () => {
  test.each([
    ["a function", `scene start\n  Value {f()}.\nend\nfunction f(): types\n  .Button\n  return 5\nend\n`],
    ["a function value", `scene start\n  local f = function(): types\n    .Button\n    return 5\n  end\n  Value {f()}.\nend\n`],
  ])("reads as one type in %s", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });

  test("with a second module prefix is reported", () => {
    const ctx = makeRuntimeStoryFromSource(`scene start\n  Value {f()}.\nend\nfunction f(): types.ui\n  .Button\n  return 5\nend\n`);
    expect(ctx.errorMessages).toEqual([expect.stringContaining("takes at most one module prefix")]);
  });
});

// The body opens only where a statement can begin: never at a line no
// statement begins with, and with no whitespace only right after the
// parameter list. Anywhere else the parser would open and close empty bodies
// at one position until its empty-match limit.
describe("a function body opens only where a statement can begin", () => {
  test.each([
    ["a stray `|`", "function f()\n| x\nend\n"],
    ["a stray `)`", "function f()\n) x\nend\n"],
    ["a stray `)` after a return type", "function f(): number\n) x\nend\n"],
    ["a member read of a Sparkle keyword name", "function f()\nlocal layout = {}\nreturn layout.x\nend\n"],
    ["a call right after the header", "function f()(g)() return 1 end\n"],
  ])("%s parses without an empty-match loop", (_name, source) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      parseSource(source);
      expect(warn.mock.calls.map((args) => String(args[0]))).not.toContainEqual(
        expect.stringContaining("empty matches"),
      );
    } finally {
      warn.mockRestore();
    }
  });
});