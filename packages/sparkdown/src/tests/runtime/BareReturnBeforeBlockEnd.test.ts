// A bare Luau `return` ends before a keyword that closes its block on the same
// line (`end`, `else`, `elseif`, `until`), as Luau reads it, so the syntax
// tree holds no unfinished return and the keyword is left to its block.

import { describe, expect, test } from "vitest";
import { checkLuau, describeDiagnostic } from "../luau-conformance/typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const syntax = (source: string) =>
  checkLuau(`local a, b, t, x = 1, 2, {}, 3\n${source}`).syntaxDiagnostics.map(describeDiagnostic);

describe("a bare return before a block-closing keyword on its line", () => {
  test.each([
    ["a local function", "local function f() return end"],
    ["a global function", "function f() return end"],
    ["a function expression", "local g = function() return end"],
    ["an if block", "if x then return end"],
    ["a do block", "do return end"],
    ["a while loop", "while x do return end"],
    ["a function whose body starts on the next line", "local function f()\n  return end"],
    ["an if block with else", "if x then return else return end"],
    ["an if block with elseif", "if x then return elseif a then end"],
    ["a repeat loop", "repeat return until x"],
    ["a block comment after the return", "local function f() return --[[c]] end"],
    ["a parenthesized value against end", "local function f() return (1)end"],
    ["an indexed value against end", "local function f() return t[1]end"],
    ["the upstream weird_fail_to_unify_type_pack snippet", "local function f() return end\nlocal g = function() return f() end"],
    ["end on the line after", "local function f()\n  return\nend"],
    ["a semicolon before end", "local function f() return; end"],
    ["a value before end", "local function f() return 1 end"],
    ["nil before end", "local function f() return nil end"],
    ["a call before end", "local g = function() return tostring(1) end"],
  ])("parses in %s", (_, source) => {
    expect(syntax(source)).toEqual([]);
  });

  test("the returning function still returns nothing", () => {
    const ctx = makeRuntimeStoryFromSource(
      `Value {g()}.\nfunction g()\n  local function f() return end\n  f()\n  return 1\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Value 1.\n");
  });
});
