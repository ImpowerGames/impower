// A function or a define's method written at the top level reads and writes
// a store, a const and a global, as Luau does (I-823), and reads the builtin
// of a stdlib name; no local is in scope where it is written, as a `local`
// at the top level is a compile error. A local function written in a scene
// reads and writes the scene's local declared above it, and calls a closure
// one holds. A define written in a function has its methods read that
// function's locals through global cells its line points at them when it
// runs (`DefineCellBinding`), which a save keeps. Saves an older engine wrote
// of scripts with top-level locals still load.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { compileScript, errorsOf, programSession, storyBeats } from "../program/programHarness";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

const LOCAL_PLACEMENT =
  "local declaration must be inside a scene, branch or function; use store or const at the top level";

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

// The root of a script that compiles with no error, so a case never runs
// what a compile reported.
const rootOf = (lines: string[]) =>
  quiet(() => {
    const { program } = compileScript([...lines, ""].join("\n"));
    expect(errorsOf(program)).toEqual([]);
    return program.chunks!;
  });

// The root of a script an older engine wrote a save of. The script declares
// locals at the top level, each a compile error; it reports no other error,
// and its program runs.
const legacyRootOf = (text: string) =>
  quiet(() => {
    const { program } = compileScript(`${text.trimEnd()}\n`);
    expect(errorsOf(program).filter(([, message]) => message !== LOCAL_PLACEMENT)).toEqual([]);
    return program.chunks!;
  });

const run = (lines: string[]) => quiet(() => shown(rootOf(lines)));

const got = (...texts: string[]) => ({ texts, errors: [] });

// The lines of scene `S`, which the story diverts to.
const inScene = (lines: string[]) => ["-> S", "scene S", ...lines.map((line) => `  ${line}`), "end"];

describe("a function written at the top level", () => {
  test.each([
    ["a store", "store a = 1"],
    ["a const", "const a = 1"],
  ])("reads %s", (_, decl) => {
    expect(run([decl, "function g()", "  return a", "end", "Got {tostring(g())}."])).toEqual(got("Got 1."));
  });

  test("reads and writes a global", () => {
    expect(
      run(["count = 0", "function inc()", "  count = count + 1", "end", "& inc()", "& inc()", "Got {count}."]),
    ).toEqual(got("Got 2."));
  });

  test("reads the builtin where no local takes its name", () => {
    expect(run(["function lib()", "  return math.abs(-3)", "end", "Got {lib()}."])).toEqual(
      got("Got 3."),
    );
  });
});

describe("a local function written in a scene and the scene's local", () => {
  test.each([
    ["a plain local", "local a = 1"],
    ["an & local", "& local a = 1"],
  ])("reads %s", (_, decl) => {
    expect(run(inScene([decl, "local function g()", "  return a", "end", "Got {tostring(g())}."]))).toEqual(
      got("Got 1."),
    );
  });

  test("calls a closure the local holds", () => {
    expect(
      run(
        inScene([
          "& local a = 1",
          "& local f = function() return a end",
          "local function g()",
          "  return f()",
          "end",
          "Got {tostring(g())}.",
        ]),
      ),
    ).toEqual(got("Got 1."));
  });

  test("writes it, in the cell a closure over it shares", () => {
    expect(
      run(
        inScene([
          "local a = 1",
          "local f = function() return a end",
          "local function set()",
          "  a = 5",
          "end",
          "& set()",
          "Got {a} {f()}.",
        ]),
      ),
    ).toEqual(got("Got 5 5."));
  });

  test("reads the scene's local where a block shadows it", () => {
    expect(
      run(
        inScene(["local a = 1", "local function g()", "  return a", "end", "if true then", "  local a = 2", "  Got {g()} {a}.", "end"]),
      ),
    ).toEqual(got("Got 1 2."));
  });

  test("reads it through another function and through recursion", () => {
    expect(
      run(
        inScene([
          "local n = 0",
          "local function r(k)",
          "  n = n + 1",
          "  if k > 0 then",
          "    r(k - 1)",
          "  end",
          "  return n",
          "end",
          "local function h()",
          "  return r(3)",
          "end",
          "Got {h()} {n}.",
        ]),
      ),
    ).toEqual(got("Got 4 4."));
  });

  test("keeps its own local of the name", () => {
    expect(
      run(inScene(["local a = 1", "local function g()", "  local a = 3", "  a = a + 1", "  return a", "end", "Got {g()} {a}."])),
    ).toEqual(got("Got 4 1."));
  });

  test("passes the local to a closure it makes", () => {
    expect(
      run(
        inScene([
          "local a = 1",
          "local function g()",
          "  return function() return a end",
          "end",
          "local h = g()",
          "a = 4",
          "Got {h()}.",
        ]),
      ),
    ).toEqual(got("Got 4."));
  });

  // A stdlib name read in a function names the builtin unless a local of
  // the name is in scope, as the scene's is here.
  test.each([
    ["a function", ["local count = 0", "local function inc()", "  count = count + 1", "  return count", "end", "Got {inc()} {count}."]],
    ["a closure", ["local count = 0", "local inc = function() count = count + 1 return count end", "Got {inc()} {count}."]],
    ["a closure in a function", ["local count = 0", "local function g()", "  local inc = function() count = count + 1 return count end", "  return inc()", "end", "Got {g()} {count}."]],
  ])("reads and writes a local named after a stdlib entry in %s", (_, lines) => {
    expect(run(inScene(lines))).toEqual(got("Got 1 1."));
  });

  test("reads a local that takes a stdlib namespace's name", () => {
    expect(run(inScene(["local math = 7", "local function g()", "  return math", "end", "Got {g()}."]))).toEqual(
      got("Got 7."),
    );
  });

  // At run time, a method call on such a local reaches the local's member
  // (StdLibMissingMemberCall.test.ts checks what a compile reports of it).
  test("calls a method of a local that takes a stdlib namespace's name", () => {
    expect(
      run(
        inScene([
          "local table = { nogetn = function() return 1 end }",
          "local function run()",
          "  return table:nogetn()",
          "end",
          "Got {run()}.",
        ]),
      ),
    ).toEqual(got("Got 1."));
  });

  test("reads it in a variadic function", () => {
    expect(
      run(inScene(["local a = 1", "local function g(...)", "  return a + select('#', ...)", "end", "Got {g(1, 2)}."])),
    ).toEqual(got("Got 3."));
  });
});

describe("a define's method written at the top level", () => {
  test("reads a store", () => {
    expect(
      run([
        "store a = 1",
        "define thing with",
        "  function get()",
        "    return a",
        "  end",
        "end",
        "Got {tostring(thing.get())}.",
      ]),
    ).toEqual(got("Got 1."));
  });
});

describe("a define written in a function", () => {
  const outer = (read: string[]) => [
    "function outer(v)",
    "  local a = v",
    "  function foo()",
    "    return a",
    "  end",
    "  define thing with",
    "    function get()",
    ...read.map((line) => `      ${line}`),
    "    end",
    "  end",
    "  return thing.get()",
    "end",
  ];

  test("has methods that read the function's local", () => {
    expect(run([...outer(["return a"]), "Got {outer(7)}."])).toEqual(got("Got 7."));
  });

  test("has methods that reach the function's local through a call", () => {
    expect(run([...outer(["return foo()"]), "Got {outer(7)}."])).toEqual(got("Got 7."));
  });

  test("gives its methods the locals of each call", () => {
    expect(run([...outer(["return a"]), "Got {outer(1)} {outer(2)} {thing.get()}."])).toEqual(
      got("Got 1 2 2."),
    );
  });

  test("has methods that read nil before the function runs", () => {
    expect(run([...outer(["return a"]), "Got {tostring(thing.get())} {outer(7)}."])).toEqual(
      got("Got nil 7."),
    );
  });

  test("leaves the methods of another define of its name alone", () => {
    expect(
      run([
        "define thing as kind with",
        "  function get()",
        "    return 3",
        "  end",
        "end",
        "function outer(v)",
        "  local a = v",
        "  define thing with",
        "    function get()",
        "      return a",
        "    end",
        "  end",
        "  return new thing():get()",
        "end",
        "Before {kind.thing.get()}.",
        "Got {outer(7)} {kind.thing.get()}.",
      ]),
    ).toEqual(got("Before 3.", "Got 3 3."));
  });

  test("has methods that keep the function's local across a save and a load", () => {
    const lines = [...outer(["return a"]), "First {outer(7)}.", "Second {tostring(thing.get())}."];
    const story = new ProgramStory(rootOf(lines));
    story.onError = () => {};
    expect(story.Continue()?.trim()).toBe("First 7.");
    const save = story.toSave();
    const loaded = new ProgramStory(rootOf(lines));
    loaded.loadSave(save);
    const { beats, errors } = storyBeats(loaded);
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Second 7."));
  });
});

describe("a save holding a top-level method value", () => {
  // `nested-define-method-value-save-569cfe902.json`, which the engine at
  // 569cfe902 wrote of `nested-define-method-value.sd` after `First.`, holds
  // the closure of a top-level method that captures nothing, though a define
  // written in it has a method that reads a top-level local: the method's
  // parameters are what its own body reads.
  test("loads, and a method whose define reads a top-level local passes its parameters", () => {
    const text = readFileSync(join(FIXTURES, "nested-define-method-value.sd"), "utf-8");
    const save = readFileSync(join(FIXTURES, "nested-define-method-value-save-569cfe902.json"), "utf-8");
    const loaded = new ProgramStory(legacyRootOf(text));
    loaded.loadSave(save);
    const { beats, errors } = storyBeats(loaded);
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Got 7."));
  });
});

describe("a save taken after a local function reached the scene's local", () => {
  test("loads into a fresh game, where the function and a closure still share the local", () => {
    const lines = inScene([
      "local a = 1",
      "local f = function() return a end",
      "local function inc()",
      "  a = a + 1",
      "  return a",
      "end",
      "First {inc()} {f()}.",
      "Second {inc()} {f()}.",
    ]);
    const story = new ProgramStory(rootOf(lines));
    story.onError = () => {};
    expect(story.Continue()?.trim()).toBe("First 2 2.");
    const save = story.toSave();
    const loaded = new ProgramStory(rootOf(lines));
    loaded.loadSave(save);
    const { beats, errors } = storyBeats(loaded);
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Second 3 3."));
  });
});

describe("an incremental compile of a scene's local function", () => {
  test.each([
    ["a read of the local added", "    return 0", "    return a", "Got 1."],
    ["a read of the local removed", "    return a", "    return 0", "Got 0."],
    ["the local added above it", "  local b = 0", "  local b = 0\n  local a = 1", "Got 1."],
    ["the local removed", "  local b = 0\n  local a = 1", "  local b = 0", "Got nil."],
  ])("shows what a cold compile shows after %s", (_, before, after, expected) => {
    const lines = [
      "-> S",
      "scene S",
      before.startsWith("    ") ? "  local a = 1" : before,
      "  local function g()",
      before.startsWith("    ") ? before : "    return a",
      "  end",
      "  Got {tostring(g())}.",
      "end",
      "",
    ];
    const session = programSession(lines.join("\n"));
    const root = session.edit(before, after);
    const cold = run([session.text]);
    expect(quiet(() => shown(root))).toEqual(cold);
    expect(cold.texts).toEqual([expected]);
  });
});
