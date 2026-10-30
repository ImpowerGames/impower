import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "../luau-conformance/diagnosticTestHarness";

const of = (code: string) => (source: string) => diagnoseDetailed(source).filter((d) => d.code === code);
const uninitialized = of("UninitializedLocal");
const unbalanced = of("UnbalancedAssignment");
const messages = (found: { message: string }[]) => found.map((d) => d.message);
const inFunction = (body: string) => `function f()\n${body}\nend\n`;
const never = (name: string, line: number) => `Variable '${name}' defined at line ${line} is never initialized or assigned; initialize with 'nil' to silence`;
const FEWER = "Assigning 2 values to 3 variables initializes extra variables with nil; add 'nil' to value list to silence";
const MORE = "Assigning 3 values to 2 variables leaves some values unused";

describe("UninitializedLocal", () => {
  test("warns at the first read with the declaration's line", () => {
    expect(uninitialized(inFunction(" local x\n print(x)\n print(x)"))).toEqual([
      {
        file: "main.sd",
        code: "UninitializedLocal",
        message: never("x", 2),
        severity: 2,
        range: { start: { line: 2, character: 7 }, end: { line: 2, character: 8 } },
      },
    ]);
  });

  test.each([
    ["a local given a value", "local x = 1\nprint(x)"],
    ["a local given nil", "local x = nil\nprint(x)"],
    ["a local assigned later", "local x\nx = 1\nprint(x)"],
    ["a local assigned by a function statement", "local x\nfunction x() end\nx()"],
    ["a local assigned in a nested function", "local x\nlocal g = function() x = 1 end\ng()\nprint(x)"],
    ["a local never read", "local _x"],
    ["names after a call", "local a, b = pcall(print)\nprint(a, b)"],
    ["names after varargs", "local g = function(...) local a, b = ...; return a, b end\nreturn g()"],
    ["a name read only in a type", "local x\nlocal y: typeof(x) = 1\nprint(y)"],
  ])("is silent for %s", (_label, body) => {
    expect(messages(uninitialized(inFunction(body)))).toEqual([]);
  });

  test.each([
    ["a compound write", "local x\nx += 1", "x", 2],
    ["a read in a nested function", "local x\nlocal g = function() return x end\nreturn g()", "x", 2],
    ["the names past a short value list", "local a, b = 1\nprint(a, b)", "b", 2],
    ["an annotated local", "local x: number\nprint(x)", "x", 2],
  ])("warns for %s", (_label, body, name, line) => {
    expect(messages(uninitialized(inFunction(body)))).toEqual([never(name, line)]);
  });

  test("a local outside every function is left alone", () => {
    expect(messages(uninitialized("& local x\n& print(x)\n"))).toEqual([]);
  });

  test("a function holding a syntax error is left alone", () => {
    const source = (extra: string) => inFunction(`local x\nprint(x)${extra}`);
    expect(messages(uninitialized(source("")))).toEqual([never("x", 2)]);
    expect(diagnoseDetailed(source("\ny = = 1")).some((d) => d.code === "SyntaxError")).toBe(true);
    expect(messages(uninitialized(source("\ny = = 1")))).toEqual([]);
  });

  test("a keyword the grammar reads in place of a name silences that name", () => {
    const source = (write: string) => inFunction(`local match\nprint(match)${write}`);
    expect(messages(uninitialized(source("")))).toEqual([never("match", 2)]);
    expect(messages(uninitialized(source("\nmatch = 1")))).toEqual([]);
  });

  test("a function in a Sparkle handler is read", () => {
    expect(messages(uninitialized("layout main with\n  button @click={ local g = function() local x; return x end; g() }\nend\n"))).toEqual([never("x", 2)]);
  });
});

describe("a function inside a type", () => {
  test.each([
    ["a type alias in a function", inFunction("type T = typeof(function() local a, b = 1; local x; return a, b, x end)")],
    ["a local's annotation", inFunction("local y: typeof((function() local a, b = 1; local x; return a, b, x end)()) = 1\nprint(y)")],
    ["a top-level type alias", "type T = typeof(function() local a, b = 1; local x; return a, b, x end)\n"],
  ])("is not checked in %s", (_label, source) => {
    expect(diagnoseDetailed(source).filter((d) => d.code === "SyntaxError")).toEqual([]);
    expect(messages(uninitialized(source))).toEqual([]);
    expect(messages(unbalanced(source))).toEqual([]);
  });

  test("LocalUnused still reads it, as Luau does", () => {
    expect(messages(of("LocalUnused")("type T = typeof(function() local unused = 1 end)\n"))).toEqual(["Variable 'unused' is never used; prefix with '_' to silence"]);
  });
});

describe("UnbalancedAssignment", () => {
  test("warns on the statement's range", () => {
    expect(unbalanced(inFunction(" local a, b, c = 1, 2\n print(a, b, c)"))).toEqual([
      {
        file: "main.sd",
        code: "UnbalancedAssignment",
        message: FEWER,
        severity: 2,
        range: { start: { line: 1, character: 1 }, end: { line: 1, character: 21 } },
      },
    ]);
  });

  test.each([
    ["a local statement with fewer values", "local a, b, c = 1, 2\nprint(a, b, c)", FEWER],
    ["an assignment with fewer values", "local a, b, c\na, b, c = 1, 2\nprint(a, b, c)", FEWER],
    ["a local statement with more values", "local a, b = 1, 2, 3\nprint(a, b)", MORE],
    ["an assignment with more values", "local a, b\na, b = 1, 2, 3\nprint(a, b)", MORE],
    ["more values after a call", "local a, b = 1, 2, pcall(print)\nprint(a, b)", MORE],
    ["a call in parentheses, which is one value", "local a, b, c = 1, (pcall(print))\nprint(a, b, c)", FEWER],
  ])("warns for %s", (_label, body, message) => {
    expect(messages(unbalanced(inFunction(body)))).toEqual([message]);
  });

  test.each([
    ["balanced lists", "local a, b = 1, 2\nprint(a, b)"],
    ["no values", "local a, b\nprint(a, b)"],
    ["a call last", "local a, b, c = 1, pcall(print)\nprint(a, b, c)"],
    ["nil last", "local a, b, c = 1, nil\nprint(a, b, c)"],
  ])("is silent for %s", (_label, body) => {
    expect(messages(unbalanced(inFunction(body)))).toEqual([]);
  });

  test.each([
    ["a logic line", "& a, b, c = 1, 2\n"],
    ["a scene's Luau", "scene s()\n  & a, b, c = 1, 2\nend\n"],
    ["a Sparkle handler", "layout main with\n  button @click={ a, b, c = 1, 2 }\nend\n"],
  ])("reads %s", (_label, source) => {
    expect(messages(unbalanced(source))).toEqual([FEWER]);
  });

  test("a store is not Luau's assignment", () => {
    expect(messages(unbalanced("store a, b, c = 1, 2\n"))).toEqual([]);
  });

  test("a statement holding a syntax error is left alone", () => {
    const source = (value: string) => inFunction(`local a, b, c = 1, ${value}\nprint(a, b, c)`);
    expect(diagnoseDetailed(source("2 + )")).some((d) => d.code === "SyntaxError")).toBe(true);
    expect(messages(unbalanced(source("2 + )")))).toEqual([]);
  });

  test.each([
    ["an error after the statement on its line", "local k = 1, m = 2\n"],
    ["a statement inside one holding a syntax error", "for\n  i = 1, 3\ndo\n  x = i\nend\n"],
  ])("is silent for %s", (_label, source) => {
    expect(messages(unbalanced(source))).toEqual([]);
  });
});
