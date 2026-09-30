import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import { checkLuau } from "../luau-conformance/typecheckTestHarness";

// A block comment right after a Luau type that closes on a later line
// (#1180). The type reads it in, since its opening line cannot see what
// follows the close; code after the close, with or without whitespace
// before it, is the next statement, while a type operator, `=` or comma
// there continues the type or its declaration.

function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  return { errors: ctx.errorMessages, output: ctx.story.ContinueMaximally() };
}

function body(lines: string[]): string {
  return `Value {f()}.\nfunction f()\n${lines.map((l) => `  ${l}\n`).join("")}end\n`;
}

describe("a block comment spanning lines after a type, with a call after its close", () => {
  test.each([
    ["typed local", body(["local w: number --[[a", "b]] print(1)", "w = 5", "return w"])],
    [
      "return type",
      `Value {f()}.\nfunction f(): number --[[a\n  b]] print(1)\n  return 5\nend\n`,
    ],
    ["optional type", body(["local w: number? --[[a", "b]] print(1)", "w = 5", "return w"])],
    ["table type", body(["local w: {number} --[[a", "b]] print(1)", "w = {5}", "return w[1]"])],
    ["union type", body(["local w: number | string --[[a", "b]] print(1)", "w = 5", "return w"])],
    ["type declaration", body(["type A = number --[[a", "b]] print(1)", "local w: A = 5", "return w"])],
    ["comment level", body(["local w: number --[==[a", "b]==] print(1)", "w = 5", "return w"])],
    ["another comment before the call", body(["local w: number --[[a", "b]] --[[c]] print(1)", "w = 5", "return w"])],
  ])("%s runs the call", (_name, source) => {
    expect(run(source)).toEqual({ errors: [], output: "Value 15.\n" });
  });

  test.each([
    ["typed local, comment on one line", body(["local w: number --[[a b]] print(1)", "w = 5", "return w"])],
    [
      "return type, comment on one line",
      `Value {f()}.\nfunction f(): number --[[a b]] print(1)\n  return 5\nend\n`,
    ],
  ])("control: %s", (_name, source) => {
    expect(run(source)).toEqual({ errors: [], output: "Value 15.\n" });
  });
});

describe("a block comment spanning lines after a type, with code right after its close", () => {
  test.each([
    ["typed local", body(["local w: number --[[a", "b]]print(1)", "w = 5", "return w"])],
    [
      "return type",
      `Value {f()}.\nfunction f(): number --[[a\n  b]]print(1)\n  return 5\nend\n`,
    ],
    ["optional type", body(["local w: number? --[[a", "b]]print(1)", "w = 5", "return w"])],
    ["table type", body(["local w: {number} --[[a", "b]]print(1)", "w = {5}", "return w[1]"])],
    ["union type", body(["local w: number | string --[[a", "b]]print(1)", "w = 5", "return w"])],
    ["type declaration", body(["type A = number --[[a", "b]]print(1)", "local w: A = 5", "return w"])],
    ["comment level", body(["local w: number --[==[a", "b]==]print(1)", "w = 5", "return w"])],
    ["a parenthesized call", body(["local w: number --[[a", "b]](print)(1)", "w = 5", "return w"])],
  ])("%s runs the call", (_name, source) => {
    expect(run(source)).toEqual({ errors: [], output: "Value 15.\n" });
  });

  test.each([
    ["a union member", body(["local w: number --[[a", "b]]|string", "w = 5", "return w"]), "Value 5.\n"],
    ["a value", body(["local w: number --[[a", "b]]= 5", "return w"]), "Value 5.\n"],
    ["another target", body(["local w: number --[[a", "b]], v = 5, 6", "return w + v"]), "Value 11.\n"],
  ])("%s right after the close continues the declaration", (_name, source, output) => {
    expect(run(source)).toEqual({ errors: [], output });
  });
});

describe("a block comment spanning lines after a type, with the type or declaration going on", () => {
  test.each([
    ["a union member after the close", body(["local w: number --[[a", "b]] | string", "w = 5", "return w"]), "Value 5.\n"],
    ["a union member on the next line", body(["local w: number --[[a", "b]]", "| string", "w = 5", "return w"]), "Value 5.\n"],
    ["the optional suffix after the close", body(["local w: number --[[a", "b]] ? = 5", "return w"]), "Value 5.\n"],
    ["a value after the close", body(["local w: number --[[a", "b]] = 5", "return w"]), "Value 5.\n"],
    ["another target after the close", body(["local w: number --[[a", "b]], v = 5, 6", "return w + v"]), "Value 11.\n"],
    ["a line comment after the close", body(["local w: number --[[a", "b]] -- c", "w = 5", "return w"]), "Value 5.\n"],
    [
      "a parameter after the close",
      `Value {f(2, 3)}.\nfunction f(a: number --[[a\n  b]], c: number)\n  return a + c\nend\n`,
      "Value 5.\n",
    ],
  ])("%s", (_name, source, output) => {
    expect(run(source)).toEqual({ errors: [], output });
  });
});

describe("a block comment spanning lines after an operator or comma", () => {
  test.each([
    ["type declaration's =", body(["type A = --[[c", "]] number", "local w: A = 5", "return w"]), "Value 5.\n"],
    ["annotation's :", body(["local w: --[[c", "]] number = 5", "return w"]), "Value 5.\n"],
    ["declaration's comma", body(["local a, --[[c", "]] b = 1, 4", "return a + b"]), "Value 5.\n"],
    ["type declaration's =, with the type right after the close", body(["type A = --[[c", "]]number", "local w: A = 5", "return w"]), "Value 5.\n"],
    ["annotation's :, with the type right after the close", body(["local w: --[[c", "]]number = 5", "return w"]), "Value 5.\n"],
    ["declaration's comma, with the target right after the close", body(["local a, --[[c", "]]b = 1, 4", "return a + b"]), "Value 5.\n"],
  ])("%s keeps the type or target after the close", (_name, source, output) => {
    expect(run(source)).toEqual({ errors: [], output });
  });
});

test("a type name continued on the line after the close keeps its qualifier", () => {
  const source = `function f(): types --[[a\nb]]\n.Button\n  return 15\nend\nQualifier {f()}.\n`;
  expect(run(source)).toEqual({ errors: [], output: "Qualifier 15.\n" });
});

describe("closing brackets before code", () => {
  const syntax = (source: string) =>
    checkLuau(source).syntaxDiagnostics.map((d) => [d.line, d.column, d.endLine, d.endColumn, d.message]);

  test.each([
    ["a typed local's comment", `function f()\n  local w: number --[[a\n  b]]print(1)\n  return 5\nend\n`],
    ["a return type's comment", `function f(): number --[[a\n  b]]print(1)\n  return 5\nend\n`],
  ])("that close %s are not reported", (_name, source) => {
    expect(syntax(source)).toEqual([]);
  });

  // No trailing type comment opened before them, so they are the first token
  // Luau cannot read, and it names the first `]`.
  test.each([
    ["in a function body", `function f()\n]]print(1)\n  return 15\nend\n`, 1, 0],
    ["right after a function header", `function f()]]print(1)\n  return 15\nend\n`, 0, 12],
    ["in a parameter list", `function f(a: number, ]]b)\n  return 15\nend\n`, 0, 22],
  ] as const)("%s with no comment before them are reported", (_name, source, line, column) => {
    expect(syntax(source)).toEqual([
      [line, column, line, column + 1, "Expected identifier when parsing expression, got ']'"],
    ]);
  });
});

test("an unfinished block comment after a type is reported", () => {
  const { errors } = run(body(["local w: number --[[a", "b"]));
  expect(errors).toContain(
    "Expected identifier when parsing expression, got unfinished comment",
  );
});
