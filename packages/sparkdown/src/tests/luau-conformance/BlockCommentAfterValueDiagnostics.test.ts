// A block comment after a value in Luau code is trivia (#1157). Its
// diagnostics match Luau's: an unfinished one is reported however the value
// before it ends, and a finished one reports nothing, even when a statement
// follows its close directly on a later line.

import { describe, expect, test } from "vitest";
import { diagnoseInFunction } from "./diagnosticTestHarness";

const UNFINISHED =
  "Expected identifier when parsing expression, got unfinished comment";

describe("an unfinished block comment after a value is reported", () => {
  test.each([
    ["a number", "local x = 1 --[[unfinished work"],
    ["a name", "local y = 1\nlocal x = y --[[unfinished work"],
    ["a string", 'local x = "s" --[[unfinished work'],
    ["a spanning comment", "local x = 1 --[[unfinished\nwork"],
    ["a leveled comment", "local x = 1 --[====[unfinished ]=] work"],
    ["a reassignment", "local x = 0\nx = 1 --[[unfinished work"],
  ])("after %s", (_name, source) => {
    expect(diagnoseInFunction(source)).toContain(UNFINISHED);
  });
});

describe("a finished block comment after a value reports nothing", () => {
  test.each([
    ["on its line", "local x = 1 --[[c]] print(x)"],
    ["spanning lines", "local x = 1 --[[a\n]] print(x)"],
    ["spanning lines, a statement right after the close", "local x = 1 --[[a\n]]print(x)"],
    [
      "spanning lines in a reassignment, a statement right after the close",
      "local x = 0\nx = 1 --[[a\n]]print(x)",
    ],
    ["a level-four comment", "local x = 1 --[====[a]=]b]====] print(x)"],
    ["before a call's arguments", "local g = function(v) end\ng --[[c]] (1)"],
  ])("%s", (_name, source) => {
    expect(diagnoseInFunction(source)).toEqual([]);
  });
});
