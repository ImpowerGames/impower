// A Luau type union or intersection written with spaces around its operator
// (`number | string`) is one type, as Luau reads it: the type does not end at
// the space before the `|` (#875).

import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "../luau-conformance/typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const syntax = (source: string) =>
  checkLuau(`type A = number\ntype B = string\n${source}`).syntaxDiagnostics.map(
    describeDiagnostic,
  );

describe("a type union written with spaces", () => {
  test.each([
    ["a local's annotation", "local x: number | string = 1"],
    ["a union of string literals", 'type T = "a" | "b"'],
    ["a union of single-quoted string literals", "type T = 'a' | 'b'"],
    ["a union of table types", "type T = { a: number } | { b: string }"],
    ["a union of names", "type C = A | B"],
    ["a parameter's annotation", "local function f(x: number | string) end"],
    ["a return type", "local function f(): number | string return 1 end"],
    ["a union of generic types", "local x: Array<number> | Map<string, number> = nil"],
    ["a union of three types", "local x: number | string | boolean = 1"],
    ["an intersection", "type T = { a: number } & { b: string }"],
    ["a union without spaces", "local x: number|string = 1"],
  ])("parses in %s", (_, source) => {
    expect(syntax(source)).toEqual([]);
  });

  test("the annotated local still gets its value", () => {
    const ctx = makeRuntimeStoryFromSource(
      `Value {f()}.\nfunction f()\n  local x: number | string = 1\n  return x\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 1.\n");
  });

  test("an alternator's arms after a typed local still separate at `|`", () => {
    const ctx = makeRuntimeStoryFromSource(
      `Value {f()} {queue | "a" | "b" end}.\nfunction f()\n  local x: number | string = 2\n  return x\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 2 a.\n");
  });
});
