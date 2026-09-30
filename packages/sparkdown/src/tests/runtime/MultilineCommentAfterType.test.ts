import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

// A block comment right after a Luau type that closes on a later line
// (#1180). The type reads it in, since its opening line cannot see what
// follows the close; code after the close is the next statement, while a
// type operator, `=` or comma there continues the type or its declaration.

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
  ])("%s keeps the type or target after the close", (_name, source, output) => {
    expect(run(source)).toEqual({ errors: [], output });
  });
});

test("an unfinished block comment after a type is reported", () => {
  const { errors } = run(body(["local w: number --[[a", "b"]));
  expect(errors).toContain(
    "Expected identifier when parsing expression, got unfinished comment",
  );
});
