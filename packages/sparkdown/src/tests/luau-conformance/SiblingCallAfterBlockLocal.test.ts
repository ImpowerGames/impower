// A function declared with `...` inside a function, called by name after a
// block that declared a `local` of the same name, is called: as in Luau, the
// local is visible only to the end of its block (I-810). The call is lowered
// against the locals of the blocks around it (`resolveCallableBinding`), a
// local of a function nested in the declaring one hides the function there
// without removing it (`lowerVariableDefinition`), and a divert names a
// `local` only where the local is in scope (`Divert.endedLocalGivesWay`).
//
// The function the calls reach captures nothing: a closure that calls such a
// function passes nil for the locals it captures, which is I-817.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

function run(source: string): { text: string; errors: string[] } {
  const ctx = makeRuntimeStoryFromSource(source);
  const errors = [...ctx.errorMessages];
  ctx.story.onError = (m: string) => errors.push(m);
  const text = ctx.story.ContinueMaximally();
  return { text, errors };
}

// `foo(n, ...)` returns `n` plus the count of its further arguments, so
// `foo(1, 2)` is 2; the locals of its name that hide it are never 2.
const story = (body: string[]) =>
  [
    "function run()",
    '  function foo(n, ...) return n + select("#", ...) end',
    ...body.map((line) => `  ${line}`),
    "end",
    "scene start",
    "  Got {run()}.",
    "end",
  ].join("\n");

describe("a call by name after the block of a local of the name", () => {
  test.each([
    ["after a do block's local", ["do local foo = 1 end", "return foo(1, 2)"]],
    [
      "after a do block's local function",
      ["do local function foo(u) return u end end", "return foo(1, 2)"],
    ],
    ["after an if block's local", ["if true then local foo = 1 end", "return foo(1, 2)"]],
    ["after a numeric for's variable", ["for foo = 7, 7 do end", "return foo(1, 2)"]],
    [
      "after a generic for's variable",
      ["for _, foo in ipairs({ 1 }) do end", "return foo(1, 2)"],
    ],
    ["after a nested block's local", ["do do local foo = 1 end end", "do return foo(1, 2) end"]],
    ["before the block", ["local r = foo(1, 2)", "do local foo = 1 end", "return r"]],
    ["after a block of another name", ["do local bar = 1 end", "return foo(1, 2)"]],
  ])("in the declaring function, %s, calls the function", (_, body) => {
    expect(run(story(body))).toEqual({ text: "Got 2.\n", errors: [] });
  });

  test.each([
    [
      "after a do block's local",
      ["local function g()", "  do local foo = 1 end", "  return foo(1, 2)", "end", "return g()"],
    ],
    [
      "after a do block's local function",
      [
        "local function g()",
        "  do local function foo(u) return u end end",
        "  return foo(1, 2)",
        "end",
        "return g()",
      ],
    ],
    [
      "after a block, in a function value",
      ["local g = function()", "  do local foo = 1 end", "  return foo(1, 2)", "end", "return g()"],
    ],
    [
      "before the local",
      ["local function g()", "  local r = foo(1, 2)", "  local foo = 1", "  return r", "end", "return g()"],
    ],
    [
      "after a block, in a closure inside it",
      [
        "local function g()",
        "  do local foo = 1 end",
        "  local h = function() return foo(1, 2) end",
        "  return h()",
        "end",
        "return g()",
      ],
    ],
    [
      "after a block, read as a value",
      ["local function g()", "  do local foo = 1 end", "  local h = foo", "  return h(1, 2)", "end", "return g()"],
    ],
  ])("in a function nested in it, %s, calls the function", (_, body) => {
    expect(run(story(body))).toEqual({ text: "Got 2.\n", errors: [] });
  });

  test.each([
    [
      "in the declaring function",
      ["do", "  local function foo(u) return u * 100 end", "  return foo(1, 2)", "end"],
    ],
    [
      "in a function nested in it",
      [
        "local function g()",
        "  do local function foo(u) return u * 100 end return foo(1, 2) end",
        "end",
        "return g()",
      ],
    ],
    [
      "from a closure in a function nested in it",
      [
        "local function g()",
        "  local foo = function(u) return u * 100 end",
        "  local h = function() return foo(1, 2) end",
        "  return h()",
        "end",
        "return g()",
      ],
    ],
  ])("inside the block, after the local, %s, calls the local", (_, body) => {
    expect(run(story(body))).toEqual({ text: "Got 100.\n", errors: [] });
  });

  test.each([
    [
      "after the block, in a function nested in it, calls what it assigns",
      [
        "local function g()",
        "  do local foo = 1 end",
        "  foo = function() return 100 end",
        "  return foo()",
        "end",
        "return g()",
      ],
      "Got 100.\n",
    ],
    [
      "after the block, in the declaring function, calls what it assigns",
      ["do local foo = 1 end", "foo = function() return 100 end", "return foo()"],
      "Got 100.\n",
    ],
    [
      "to the local inside the block leaves the function to the call after it",
      [
        "local function g()",
        "  do local foo = 1 foo = function() return 100 end end",
        "  return foo(1, 2)",
        "end",
        "return g()",
      ],
      "Got 2.\n",
    ],
  ])("an assignment to the name %s", (_, body, text) => {
    expect(run(story(body))).toEqual({ text, errors: [] });
  });
});
