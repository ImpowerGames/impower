// A function statement (`function g() ... end`, no `local`) written inside a
// function is `g = function() ... end`, as Luau's is (I-1422). Naming a
// top-level local in scope where the function is written, it assigns that
// local: the function's entry binds the name to the root frame's local
// (`RootBinding`, I-823). With no local of the name in scope, it assigns
// the global. It never declares a local of the function. The
// enclosing-function case is EnclosingLocalFunctionStatement.test.ts
// (I-1349).

import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import {
  MAIN_URI,
  compileScript,
  errorsOf,
  programCompiler,
  programSession,
  storyBeats,
} from "../program/programHarness";

const quiet = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const shown = (root: ProgramRoot) => {
  const { beats, errors } = storyBeats(new ProgramStory(root));
  return { texts: beats.map((b) => b.text.trim()), errors };
};

const run = (lines: string[]) =>
  quiet(() => {
    const { program } = compileScript([...lines, ""].join("\n"));
    expect(errorsOf(program)).toEqual([]);
    return shown(program.chunks!);
  });

const got = (...texts: string[]) => ({ texts, errors: [] });

describe("a function statement in a top-level function naming a top-level local", () => {
  test("assigns the local", () => {
    expect(
      run([
        "local function g() return 1 end",
        "function change()",
        "  function g() return 3 end",
        "end",
        "& change()",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("assigns a local holding a value", () => {
    expect(
      run([
        "local g = 1",
        "function change()",
        "  function g() return 3 end",
        "end",
        "& change()",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("assigns the local from a block inside the function", () => {
    expect(
      run([
        "local function g() return 1 end",
        "function change()",
        "  do",
        "    function g() return 3 end",
        "  end",
        "end",
        "& change()",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("assigns the local from an if inside the function", () => {
    expect(
      run([
        "local function g() return 1 end",
        "function change(x)",
        "  if x then",
        "    function g() return 3 end",
        "  end",
        "end",
        "& change(false)",
        "Before {g()}.",
        "& change(true)",
        "Got {g()}.",
      ]),
    ).toEqual(got("Before 1.", "Got 3."));
  });

  test("assigns the local from a local function inside the function", () => {
    expect(
      run([
        "local function g() return 1 end",
        "function change()",
        "  local function inner()",
        "    function g() return 3 end",
        "  end",
        "  inner()",
        "end",
        "& change()",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("a variadic definition assigns the local", () => {
    expect(
      run([
        "local function g() return 1 end",
        "function change()",
        '  function g(...) return select("#", ...) + 3 end',
        "end",
        "& change()",
        "Got {g()} {g(1, 2)}.",
      ]),
    ).toEqual(got("Got 3 5."));
  });

  test("the defining function, other functions and closures see the new value", () => {
    expect(
      run([
        "local function g() return 1 end",
        "local f = function() return g() end",
        "function get()",
        "  return g()",
        "end",
        "function change()",
        "  function g() return 3 end",
        "  return g()",
        "end",
        "Got {change()} {get()} {f()} {g()}.",
      ]),
    ).toEqual(got("Got 3 3 3 3."));
  });

  test("a definition that calls itself reads the local", () => {
    expect(
      run([
        "local function g() return 1 end",
        "function change()",
        "  function g(n) if n > 0 then return g(n - 1) + 1 end return 0 end",
        "end",
        "& change()",
        "Got {g(3)}.",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("assigns the declaration in scope of a name declared twice", () => {
    expect(
      run([
        "local g = 1",
        "function first() return g end",
        "local g = 2",
        "function change()",
        "  function g() return 3 end",
        "end",
        "& change()",
        "Got {first()} {g()}.",
      ]),
    ).toEqual(got("Got 1 3."));
  });

  test("a define's method assigns the local", () => {
    expect(
      run([
        "local g = 1",
        "define thing with",
        "  function m()",
        "    function g() return 3 end",
        "  end",
        "end",
        "& thing.m()",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("a closure written at the top level assigns the local", () => {
    expect(
      run([
        "local g = 1",
        "local h = function()",
        "  function g() return 3 end",
        "end",
        "& h()",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("a parameter of the function of that name is assigned instead", () => {
    expect(
      run([
        "local function g() return 1 end",
        "function change(g)",
        "  function g() return 3 end",
        "  return g()",
        "end",
        "Got {change(nil)} {g()}.",
      ]),
    ).toEqual(got("Got 3 1."));
  });

  test("a local of the function of that name is assigned instead", () => {
    expect(
      run([
        "local function g() return 1 end",
        "function change()",
        "  local g = nil",
        "  function g() return 3 end",
        "  return g()",
        "end",
        "Got {change()} {g()}.",
      ]),
    ).toEqual(got("Got 3 1."));
  });
});

// With no local of the name in scope, the statement assigns the global, as
// an assignment of the name does: a top-level `local function` is a
// function of the story, as a top-level `function` is, and a `store` is a
// global, in whatever script and form they are declared.
describe("a function statement in a top-level function naming a global", () => {
  test.each([
    ["a top-level function", "function g() return 1 end"],
    ["a store", "store g = 1"],
    ["an & store", "& store g = 1"],
    ["an & local function", "& local function g() return 1 end"],
    ["an & local", "& local g = 1"],
  ])("assigns %s", (_, decl) => {
    expect(
      run([decl, "function change()", "  function g() return 3 end", "end", "& change()", "Got {g()}."]),
    ).toEqual(got("Got 3."));
  });

  test("assigns a store declared in another script", () => {
    const { program } = quiet(() =>
      programCompiler({
        [MAIN_URI]: ["function change()", "  function g() return 3 end", "end", "& change()", "Got {g()}.", ""].join("\n"),
        "inmemory:///other.sd": ["store g = 1", ""].join("\n"),
      }).compile(),
    );
    expect(errorsOf(program)).toEqual([]);
    expect(quiet(() => shown(program.chunks!))).toEqual(got("Got 3."));
  });

  test("a closure written at the top level assigns a top-level local function", () => {
    expect(
      run([
        "local function g() return 1 end",
        "local h = function()",
        "  function g() return 3 end",
        "end",
        "& h()",
        "Got {g()}.",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("a name the story declares nowhere becomes a global once the function runs", () => {
    expect(
      run([
        "function change()",
        "  function g() return 3 end",
        "  return g()",
        "end",
        "Before {tostring(g)}.",
        "Got {change()} {g()}.",
      ]),
    ).toEqual(got("Before nil.", "Got 3 3."));
  });

  test("a name declared nowhere, defined in a nested function, is the same global", () => {
    expect(
      run([
        "function change()",
        "  local function inner()",
        "    function g() return 3 end",
        "  end",
        "  inner()",
        "end",
        "function call() return g() end",
        "& change()",
        "Got {call()}.",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("reports reassigning a top-level const, as an assignment does", () => {
    const { program } = quiet(() =>
      compileScript(["const g = 1", "function change()", "  function g() return 3 end", "end", ""].join("\n")),
    );
    expect(errorsOf(program)).toEqual([[2, "Cannot re-assign the const `g`."]]);
  });
});

// Which variable the statement assigns depends on the lines above the
// function (the top-level `local` its entry binds, or the global), so an
// edit there lowers the function again.
describe("an incremental compile of a function statement naming a top-level name", () => {
  test.each([
    ["the local added above it", "store b = 0", "store b = 0\nlocal g = 1", "Got 3 3."],
    ["the local removed", "store b = 0\nlocal g = 1", "store b = 0", "Got 3 3."],
    ["a top-level function added", "store b = 0", "store b = 0\nfunction g() return 1 end", "Got 3 3."],
    ["the top-level function removed", "store b = 0\nfunction g() return 1 end", "store b = 0", "Got 3 3."],
  ])("shows what a cold compile shows after %s", (_, before, after, expected) => {
    const lines = [
      before,
      "function change()",
      "  function g() return 3 end",
      "  return g()",
      "end",
      "Got {change()} {tostring(g and g())}.",
      "",
    ];
    const session = programSession(lines.join("\n"));
    const root = session.edit(before, after);
    const cold = run([session.text]);
    expect(quiet(() => shown(root))).toEqual(cold);
    expect(cold.texts).toEqual([expected]);
  });
});
