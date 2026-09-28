import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

// As in Luau, a type union may go on to the next line: a line that starts
// with `|` continues the type that ended the line before it, whether or not
// that type ends in `?`. Any other line ends the type.

const TYPES = [
  ["an optional type", "number?"],
  ["a plain type", "number"],
] as const;

describe("a union that goes on to the next line parses", () => {
  test.each(
    TYPES.flatMap(([name, type]) => [
      [name, "a local", `local v: ${type}\n    | string = 1\nlocal s = 1\n`],
      [name, "a local, after a blank line", `local v: ${type}\n\n    | string = 1\nlocal s = 1\n`],
      [name, "a local, over three lines", `local v: ${type}\n    | string\n    | boolean = 1\nlocal s = 1\n`],
      [name, "a local, unindented", `local v: ${type}\n| string = 1\nlocal s = 1\n`],
      [name, "a type alias", `type T = ${type}\n    | string\nlocal s = 1\n`],
      [name, "an exported type alias", `export type T = ${type}\n    | string\nlocal s = 1\n`],
      [name, "a return type", `local function f(): ${type}\n    | string\n  return 1\nend\n`],
      [name, "a parameter", `local function f(x: ${type}\n    | string)\nend\n`],
      [name, "a table field", `type T = {\n  a: ${type}\n    | string,\n  b: number,\n}\n`],
    ]),
  )("after %s, in %s", (_type, _context, snippet) => {
    expect(checkLuau(`\n${snippet}`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
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
  ])("with %s", (_name, source, output) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(output);
  });
});
