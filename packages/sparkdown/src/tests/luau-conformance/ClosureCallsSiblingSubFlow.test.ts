// A closure that calls a function declared with `...` in the same function
// passes that function the locals it captures, whether or not the closure
// reads them itself (I-817). Since I-1360 the function lowers as a closure
// assigned to a local of the function around it, which captures the locals
// it reads where it is defined, and a closure that calls it captures that
// local (`lowerNestedNamedFunction`).

import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { compileScript, programSession, storyBeats } from "../program/programHarness";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

function run(source: string): { text: string; errors: string[] } {
  const ctx = makeRuntimeStoryFromSource(source);
  const errors = [...ctx.errorMessages];
  ctx.story.onError = (m: string) => errors.push(m);
  const text = ctx.story.ContinueMaximally();
  return { text, errors };
}

// `foo` returns the `base` it closes over.
const story = (body: string[]) =>
  [
    "function run()",
    "  local base = 10",
    "  function foo(...)",
    "    return base",
    "  end",
    ...body.map((line) => `  ${line}`),
    "end",
    "Got {run()}.",
  ].join("\n");

describe("a closure that calls a variadic function of the same function", () => {
  test.each([
    ["called directly", ["return foo()"]],
    ["a function value calling it", ["local bar = function()", "  return foo()", "end", "return bar()"]],
    [
      "a function value that also reads the local",
      ["local bar = function()", "  local seen = base", "  return foo()", "end", "return bar()"],
    ],
    ["a local function calling it", ["local function bar()", "  return foo()", "end", "return bar()"]],
    [
      "a function value in a do block calling it",
      ["do", "  local bar = function()", "    return foo()", "  end", "  return bar()", "end"],
    ],
    [
      "a function value nested in another calling it",
      [
        "local outer = function()",
        "  local inner = function()",
        "    return foo()",
        "  end",
        "  return inner()",
        "end",
        "return outer()",
      ],
    ],
    [
      "a function value reading it as a value",
      ["local bar = function()", "  local g = foo", "  return g()", "end", "return bar()"],
    ],
    [
      "a function value passing it arguments",
      ["local bar = function(x)", "  return foo(x, x)", "end", "return bar(3)"],
    ],
    [
      "another variadic function calling it",
      ["function bar(...)", "  return foo()", "end", "return bar()"],
    ],
    [
      "a function value calling another variadic function that calls it",
      [
        "function bar(...)",
        "  return foo()",
        "end",
        "local baz = function()",
        "  return bar()",
        "end",
        "return baz()",
      ],
    ],
  ])("%s reads the local it closes over", (_, body) => {
    expect(run(story(body))).toEqual({ text: "Got 10.\n", errors: [] });
  });

  test("a closure's call writes the local the function closes over", () => {
    const source = [
      "function run()",
      "  local base = 10",
      "  function inc(...)",
      "    base = base + 1",
      "  end",
      "  local bar = function()",
      "    inc()",
      "  end",
      "  bar()",
      "  bar()",
      "  return base",
      "end",
      "Got {run()}.",
    ].join("\n");
    expect(run(source)).toEqual({ text: "Got 12.\n", errors: [] });
  });

  test("a closure whose local of the name hides the function calls its local", () => {
    const source = story([
      "local bar = function()",
      "  local foo = function() return 7 end",
      "  return foo()",
      "end",
      "return bar()",
    ]);
    expect(run(source)).toEqual({ text: "Got 7.\n", errors: [] });
  });

  test("a closure calling a variadic function that calls itself", () => {
    const source = [
      "function run()",
      "  local base = 10",
      "  function down(n, ...)",
      "    if n == 0 then return base end",
      "    return down(n - 1)",
      "  end",
      "  local bar = function()",
      "    return down(3)",
      "  end",
      "  return bar()",
      "end",
      "Got {run()}.",
    ].join("\n");
    expect(run(source)).toEqual({ text: "Got 10.\n", errors: [] });
  });

  test("a closure reading a local of the same function besides the function's", () => {
    const source = story([
      "local other = 5",
      "local bar = function()",
      "  return foo() + other",
      "end",
      "return bar()",
    ]);
    expect(run(source)).toEqual({ text: "Got 15.\n", errors: [] });
  });
});

// An edit to the function's body alone that changes the locals it captures
// changes the function's statement, while the closure that calls it captures
// only the function's local and keeps its own: an incremental compile gives
// the closure's call what a cold compile of the edited script does. `other`
// is declared before the function, so the function's body
// reads it as Luau scopes it: these cases expected the same results with
// `other` declared after the function, which a call reached only because
// it looked the captured names up where the call was written (I-1361).
describe("an edit to the body of a variadic function a closure calls", () => {
  const texts = (root: ProgramRoot) =>
    storyBeats(new ProgramStory(root)).beats.map((beat) => beat.text);

  test.each([
    ["reads another local", "return base", "return other", ["Got 5.\n"]],
    ["reads both locals", "return base", "return base + other", ["Got 15.\n"]],
    ["reads no local", "return base", "return 7", ["Got 7.\n"]],
  ])("so that it %s, gives the closure's call what a cold compile does", (_, before, after, expected) => {
    const source = [
      "function run()",
      "  local base = 10",
      "  local other = 5",
      "  function foo(...)",
      "    return base",
      "  end",
      "  local bar = function()",
      "    return foo()",
      "  end",
      "  return bar()",
      "end",
      "Got {run()}.",
    ].join("\n");
    const session = programSession(source);
    expect(texts(session.root)).toEqual(["Got 10.\n"]);
    const edited = session.edit(before, after);
    expect(texts(edited)).toEqual(expected);
    expect(texts(compileScript(session.text).program.chunks!)).toEqual(expected);
  });
});
