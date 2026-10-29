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

const inScene = (lines: string[]) => ["-> S", "scene S", ...lines.map((line) => `  ${line}`), "end"];

describe("a function statement in a scene's local function naming the scene's local", () => {
  test("assigns the local", () => {
    expect(
      run(
        inScene([
          "local function g() return 1 end",
          "local function change()",
          "  function g() return 3 end",
          "end",
          "& change()",
          "Got {g()}.",
        ]),
      ),
    ).toEqual(got("Got 3."));
  });

  test("assigns a local holding a value", () => {
    expect(
      run(
        inScene([
          "local g = 1",
          "local function change()",
          "  function g() return 3 end",
          "end",
          "& change()",
          "Got {g()}.",
        ]),
      ),
    ).toEqual(got("Got 3."));
  });

  test("assigns the local from a block inside the function", () => {
    expect(
      run(
        inScene([
          "local function g() return 1 end",
          "local function change()",
          "  do",
          "    function g() return 3 end",
          "  end",
          "end",
          "& change()",
          "Got {g()}.",
        ]),
      ),
    ).toEqual(got("Got 3."));
  });

  test("assigns the local from an if inside the function", () => {
    expect(
      run(
        inScene([
          "local function g() return 1 end",
          "local function change(x)",
          "  if x then",
          "    function g() return 3 end",
          "  end",
          "end",
          "& change(false)",
          "Before {g()}.",
          "& change(true)",
          "Got {g()}.",
        ]),
      ),
    ).toEqual(got("Before 1.", "Got 3."));
  });

  test("assigns the local from a local function inside the function", () => {
    expect(
      run(
        inScene([
          "local function g() return 1 end",
          "local function change()",
          "  local function inner()",
          "    function g() return 3 end",
          "  end",
          "  inner()",
          "end",
          "& change()",
          "Got {g()}.",
        ]),
      ),
    ).toEqual(got("Got 3."));
  });

  test("a variadic definition assigns the local", () => {
    expect(
      run(
        inScene([
          "local function g() return 1 end",
          "local function change()",
          '  function g(...) return select("#", ...) + 3 end',
          "end",
          "& change()",
          "Got {g()} {g(1, 2)}.",
        ]),
      ),
    ).toEqual(got("Got 3 5."));
  });

  test("the defining function, other functions and closures see the new value", () => {
    expect(
      run(
        inScene([
          "local function g() return 1 end",
          "local f = function() return g() end",
          "local function get()",
          "  return g()",
          "end",
          "local function change()",
          "  function g() return 3 end",
          "  return g()",
          "end",
          "Got {change()} {get()} {f()} {g()}.",
        ]),
      ),
    ).toEqual(got("Got 3 3 3 3."));
  });

  test("a definition that calls itself reads the local", () => {
    expect(
      run(
        inScene([
          "local function g() return 1 end",
          "local function change()",
          "  function g(n) if n > 0 then return g(n - 1) + 1 end return 0 end",
          "end",
          "& change()",
          "Got {g(3)}.",
        ]),
      ),
    ).toEqual(got("Got 3."));
  });

  test("assigns the declaration in scope of a name declared twice", () => {
    expect(
      run(
        inScene([
          "local g = 1",
          "local function first() return g end",
          "local g = 2",
          "local function change()",
          "  function g() return 3 end",
          "end",
          "& change()",
          "Got {first()} {g()}.",
        ]),
      ),
    ).toEqual(got("Got 1 3."));
  });

  test("a method of a define written in a local function assigns the local", () => {
    expect(
      run(
        inScene([
          "local g = 1",
          "local function install()",
          "  define thing with",
          "    function m()",
          "      function g() return 3 end",
          "    end",
          "  end",
          "end",
          "& install()",
          "& thing.m()",
          "Got {g()}.",
        ]),
      ),
    ).toEqual(got("Got 3."));
  });

  test("a closure assigns the local", () => {
    expect(
      run(
        inScene([
          "local g = 1",
          "local h = function()",
          "  function g() return 3 end",
          "end",
          "& h()",
          "Got {g()}.",
        ]),
      ),
    ).toEqual(got("Got 3."));
  });

  test("a parameter of the function of that name is assigned instead", () => {
    expect(
      run(
        inScene([
          "local function g() return 1 end",
          "local function change(g)",
          "  function g() return 3 end",
          "  return g()",
          "end",
          "Got {change(nil)} {g()}.",
        ]),
      ),
    ).toEqual(got("Got 3 1."));
  });

  test("a local of the function of that name is assigned instead", () => {
    expect(
      run(
        inScene([
          "local function g() return 1 end",
          "local function change()",
          "  local g = nil",
          "  function g() return 3 end",
          "  return g()",
          "end",
          "Got {change()} {g()}.",
        ]),
      ),
    ).toEqual(got("Got 3 1."));
  });
});

describe("a function statement in a top-level function naming a global", () => {
  test.each([
    ["a top-level function", "function g() return 1 end"],
    ["a store", "store g = 1"],
    ["an & store", "& store g = 1"],
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

describe("a call after a function statement named after a builtin", () => {
  const forms = [
    ["the function statement", "  function type(x) return 'replacement' end"],
    ["the assignment", "  type = function(x) return 'replacement' end"],
  ];

  test.each(forms)("reaches the new function in the same function after %s", (_, def) => {
    expect(run(["function change()", def, "  return type(1)", "end", "Got {change()}."])).toEqual(
      got("Got replacement."),
    );
  });

  test.each(forms)("reaches it after a block inside the function after %s", (_, def) => {
    expect(
      run(["function change()", "  do", `  ${def}`, "  end", "  return type(1)", "end", "Got {change()}."]),
    ).toEqual(got("Got replacement."));
  });

  test.each(forms)("reaches it in a local function inside the function after %s", (_, def) => {
    expect(
      run([
        "function change()",
        "  local function inner()",
        `  ${def}`,
        "    return type(1)",
        "  end",
        "  return inner()",
        "end",
        "Got {change()}.",
      ]),
    ).toEqual(got("Got replacement."));
  });

  test.each(forms)("reaches it in a define's method after %s", (_, def) => {
    expect(
      run([
        "define thing with",
        "  function m()",
        `  ${def}`,
        "    return type(1)",
        "  end",
        "end",
        "Got {thing.m()}.",
      ]),
    ).toEqual(got("Got replacement."));
  });

  const recursive = [
    "  function type(n)",
    "    if n == 0 then return 'replacement' end",
    "    return type(n - 1)",
    "  end",
  ];

  test("a recursive call in the definition's own body reaches the new function", () => {
    expect(
      run(["function change()", ...recursive, "  return type(1)", "end", "Got {change()}."]),
    ).toEqual(got("Got replacement."));
  });

  test("a recursive call reaches it from a block, a local function and a define's method", () => {
    const inBlock = ["function a()", "  do", ...recursive.map((l) => `  ${l}`), "  end", "  return type(1)", "end"];
    const inInner = [
      "function b()",
      "  local function inner()",
      ...recursive.map((l) => `  ${l}`),
      "    return type(1)",
      "  end",
      "  return inner()",
      "end",
    ];
    const inMethod = [
      "define thing with",
      "  function m()",
      ...recursive.map((l) => `  ${l}`),
      "    return type(1)",
      "  end",
      "end",
    ];
    expect(run([...inBlock, "A {a()}."])).toEqual(got("A replacement."));
    expect(run([...inInner, "B {b()}."])).toEqual(got("B replacement."));
    expect(run([...inMethod, "M {thing.m()}."])).toEqual(got("M replacement."));
  });

  test("a recursive call reaches a scene's local the statement assigns", () => {
    expect(
      run(
        inScene([
          "local count = 0",
          "local function change()",
          "  function count(n)",
          "    if n == 0 then return 'replacement' end",
          "    return count(n - 1)",
          "  end",
          "end",
          "& change()",
          "Got {count(2)}.",
        ]),
      ),
    ).toEqual(got("Got replacement."));
  });

  test("a local of the name keeps the builtin for the global", () => {
    expect(
      run([
        "function change()",
        "  local type = nil",
        "  function type(x) return 'replacement' end",
        "  return type(1)",
        "end",
        "Got {change()} {type(1)}.",
      ]),
    ).toEqual(got("Got replacement number."));
  });
});

describe("an incremental compile of a function statement naming a top-level name", () => {
  test.each([
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
