import { describe, expect, test, vi } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";

// As in Luau, a type union may go on to the next line: a line that starts
// with `|` continues the type that ended the line before it, whether or not
// that type ends in `?`. Any other line ends the type.

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
      [name, "a local", type, `local v: ${type}\n    | string = 1\nlocal s = 1\n`],
      [name, "a local, after a blank line", type, `local v: ${type}\n\n    | string = 1\nlocal s = 1\n`],
      [name, "a local, over three lines", type, `local v: ${type}\n    | string\n    | boolean = 1\nlocal s = 1\n`],
      [name, "a local, unindented", type, `local v: ${type}\n| string = 1\nlocal s = 1\n`],
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
      [name, "a local", `Value {f()}.\nfunction f()\n  local _v: ${type}\n    | string\n  return 5\nend\n`],
      [name, "a return type", `Value {f()}.\nfunction f(): ${type}\n    | string\n  return 5\nend\n`],
      [name, "a type alias", `Value {f()}.\nfunction f()\n  type T = ${type}\n    | string\n  return 5\nend\n`],
      [name, "a type function's return type", `Value {f()}.\ntype function tf(t): ${type}\n    | string\n  return t\nend\nfunction f()\n  return 5\nend\n`],
    ]),
  )("after %s, in %s", (_type, _context, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });
});

// A type that ends its line takes the line break in, so each rule around it
// has to end at the start of the next line, indented or not.
describe("a type at the end of a line still ends at the next line's code", () => {
  test.each([
    ["a local and prose", `local x: number\nHello {f()}.\nfunction f()\n  return 5\nend\n`, "Hello 5.\n"],
    ["a local, a blank line and prose", `local x: number\n\nHello {f()}.\nfunction f()\n  return 5\nend\n`, "Hello 5.\n"],
    ["a local and a function", `local x: number\nfunction f()\n  return 5\nend\nHello {f()}.\n`, "Hello 5.\n"],
    ["a type alias and prose", `type T = number\nHello {f()}.\nfunction f()\n  return 5\nend\n`, "Hello 5.\n"],
    ["a return type and an unindented body", `Hello {f()}.\nfunction f(): number\nreturn 5\nend\n`, "Hello 5.\n"],
    ["a return type and a call", `Hello {f()}.\nfunction f(): number\n  print(1)\n  return 5\nend\n`, "Hello 15.\n"],
    ["an unindented local and a call", `Hello {f()}.\nfunction f()\nlocal _v: number\nprint(1)\nreturn 5\nend\n`, "Hello 15.\n"],
    ["a local with a value and another local", `Hello {f()}.\nfunction f()\n  local a: number = 2 local b = 3\n  return a + b\nend\n`, "Hello 5.\n"],
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
    ["a typed local on the header's line", `Value {f()}.\nfunction f() local x: number = 5\n  return x\nend\n`, "Value 5.\n"],
    ["statements separated by semicolons on the header's line", `Value {f(3)}.\nfunction f(n) local x = {}; for i = 1, n do x[i] = i end;\n  return #x\nend\n`, "Value 3.\n"],
    ["a header ending in a colon", `Value {f(4)}.\nfunction f(x):\n  local y = x + 1\n  return y\nend\n`, "Value 5.\n"],
    ["call values after a comma", `Value {f()}.\nfunction f()\n  local a, b = math.sqrt(4), math.sqrt(9)\n  return a + b\nend\n`, "Value 5.\n"],
    ["a call in parentheses first on the header's line", `Value {f()}.\nfunction f() (function() print(1) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses first after parameters", `Value {f(1)}.\nfunction f(a) (function() print(a) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses first after a return type ending in `?`", `Value {f()}.\nfunction f(): number? (function() print(1) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses first after a return type ending in a name", `Value {f()}.\nfunction f(): number (function() print(1) end)() return 5 end\n`, "Value 15.\n"],
    ["parameters after a space, then a call in parentheses", `Value {f(1)}.\nfunction f (a) (function() print(a) end)() return 5 end\n`, "Value 15.\n"],
    ["generic parameters after a space, then a call in parentheses", `Value {f(1)}.\nfunction f<T> (a: T) (function() print(a) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses right after the header", `Value {f()}.\nfunction f()(function() print(1) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses right after generic parameters", `Value {f(1)}.\nfunction f<T>(a: T)(function() print(a) end)() return 5 end\n`, "Value 15.\n"],
    ["a call in parentheses right after a dotted header", `local t = {}\nfunction t.g()(function() print(1) end)() return 5 end\nValue {t.g()}.\n`, "Value 15.\n"],
    ["a call in parentheses right after a method header", `local t = {}\nfunction t:m()(function() print(1) end)() return 5 end\nValue {t:m()}.\n`, "Value 15.\n"],
    ["a call in parentheses right after an anonymous header", `local f = function()(function() print(1) end)() return 5 end\nValue {f()}.\n`, "Value 15.\n"],
    ["statements right after the header", `Value {f()}.\nfunction f()local x = 5 return x end\n`, "Value 5.\n"],
  ])("with %s", (_name, source, output) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(output);
  });
});

// A declaration goes on across any run of whitespace before a comma or `=`.
describe("a declaration with extra whitespace before a comma or `=`", () => {
  test.each([
    ["two spaces before a comma", `Value {f()}.\nfunction f()\n  local a, b = 2  , 3\n  return a + b\nend\n`],
    ["two spaces before a comma between typed names", `Value {f()}.\nfunction f()\n  local a: number  , b: number = 2, 3\n  return a + b\nend\n`],
    ["two spaces before `=`", `Value {f()}.\nfunction f()\n  local a  = 5\n  return a\nend\n`],
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
    ["a function", `Value {f()}.\nfunction f(): types\n  .Button\n  return 5\nend\n`],
    ["a function value", `local f = function(): types\n  .Button\n  return 5\nend\nValue {f()}.\n`],
  ])("reads as one type in %s", (_name, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });

  test("with a second module prefix is reported", () => {
    const ctx = makeRuntimeStoryFromSource(`Value {f()}.\nfunction f(): types.ui\n  .Button\n  return 5\nend\n`);
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