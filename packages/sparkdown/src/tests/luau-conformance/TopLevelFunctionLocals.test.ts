// A function or a define's method written at the top level reads and writes
// a top-level local declared above it, and calls a closure one holds, as Luau
// does (I-823). A top-level function is a flow of its own, called in a frame
// of its own and callable from lines above its definition, and a define's
// table is built when the story starts, so neither can capture the local as
// a closure does when it is built: each binds, at its entry, every name it
// reads that no scope of its own binds to the root frame's local of that
// name, when one exists as it runs (`Op.BindRoot`), and reads the global
// otherwise. A define written in a function has its methods read that
// function's locals through global cells its line points at them when it
// runs (`DefineCellBinding`), which a save keeps.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { compileScript, errorsOf, programSession, storyBeats } from "../program/programHarness";
import { flowListings, programListing } from "../programListing";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

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

const run = (lines: string[]) => quiet(() => shown(rootOf(lines)));

const got = (...texts: string[]) => ({ texts, errors: [] });

const fnReads = (decl: string) => [decl, "function g()", "  return a", "end", "Got {tostring(g())}."];

const methodReads = (decl: string) => [
  decl,
  "define thing with",
  "  function get()",
  "    return a",
  "  end",
  "end",
  "Got {tostring(thing.get())}.",
];

describe("a function written at the top level and a top-level local", () => {
  test.each([
    ["a plain local", "local a = 1"],
    ["an & local", "& local a = 1"],
    ["a store", "store a = 1"],
    ["a const", "const a = 1"],
  ])("reads %s", (_, decl) => {
    expect(run(fnReads(decl))).toEqual(got("Got 1."));
  });

  test("reads a local declared with local function", () => {
    expect(run(["local a = 1", "local function g()", "  return a", "end", "Got {g()}."])).toEqual(
      got("Got 1."),
    );
  });

  test("calls a closure the local holds", () => {
    expect(
      run([
        "& local a = 1",
        "& local f = function() return a end",
        "function g()",
        "  return f()",
        "end",
        "Got {tostring(g())}.",
      ]),
    ).toEqual(got("Got 1."));
  });

  test("writes it, in the cell a closure over it shares", () => {
    expect(
      run([
        "local a = 1",
        "local f = function() return a end",
        "function set()",
        "  a = 5",
        "end",
        "& set()",
        "Got {a} {f()}.",
      ]),
    ).toEqual(got("Got 5 5."));
  });

  test("reads nil when called above the local's line, and the local below it", () => {
    expect(
      run(["Got {tostring(g())}.", "local a = 1", "function g()", "  return a", "end", "Got {tostring(g())}."]),
    ).toEqual(got("Got nil.", "Got 1."));
  });

  test("reads and writes a global no top-level local names", () => {
    expect(
      run(["count = 0", "function inc()", "  count = count + 1", "end", "& inc()", "& inc()", "Got {count}."]),
    ).toEqual(got("Got 2."));
  });

  test("reads the top-level local where a block shadows it", () => {
    expect(
      run(["local a = 1", "function g()", "  return a", "end", "if true then", "  local a = 2", "  Got {g()} {a}.", "end"]),
    ).toEqual(got("Got 1 2."));
  });

  test("reads it from a scene", () => {
    expect(
      run(["local a = 1", "function g()", "  return a", "end", "-> S", "scene S", "  Got {g()}.", "end"]),
    ).toEqual(got("Got 1."));
  });

  test("reads it through another function and through recursion", () => {
    expect(
      run([
        "local n = 0",
        "function r(k)",
        "  n = n + 1",
        "  if k > 0 then",
        "    r(k - 1)",
        "  end",
        "  return n",
        "end",
        "function h()",
        "  return r(3)",
        "end",
        "Got {h()} {n}.",
      ]),
    ).toEqual(got("Got 4 4."));
  });

  test("keeps its own local of the name", () => {
    expect(
      run(["local a = 1", "function g()", "  local a = 3", "  a = a + 1", "  return a", "end", "Got {g()} {a}."]),
    ).toEqual(got("Got 4 1."));
  });

  test("passes the local to a closure it makes", () => {
    expect(
      run([
        "local a = 1",
        "function g()",
        "  return function() return a end",
        "end",
        "local h = g()",
        "a = 4",
        "Got {h()}.",
      ]),
    ).toEqual(got("Got 4."));
  });

  test("reads it in a variadic function", () => {
    expect(
      run(["local a = 1", "function g(...)", "  return a + select('#', ...)", "end", "Got {g(1, 2)}."]),
    ).toEqual(got("Got 3."));
  });
});

describe("a define's method written at the top level and a top-level local", () => {
  test.each([
    ["a plain local", "local a = 1"],
    ["an & local", "& local a = 1"],
    ["a store", "store a = 1"],
  ])("reads %s", (_, decl) => {
    expect(run(methodReads(decl))).toEqual(got("Got 1."));
  });

  test("writes it", () => {
    expect(
      run(["local a = 1", "define thing with", "  function set()", "    a = 9", "  end", "end", "& thing.set()", "Got {a}."]),
    ).toEqual(got("Got 9."));
  });

  test("reads it beside self", () => {
    expect(
      run([
        "local a = 1",
        "define thing with",
        "  n = 2",
        "  function get()",
        "    return a + self.n",
        "  end",
        "end",
        "Got {thing:get()}.",
      ]),
    ).toEqual(got("Got 3."));
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

describe("the entry of a function written at the top level", () => {
  test("binds after its parameters each name it reads that no scope of its own binds", () => {
    const listing = flowListings(
      rootOf([
        "local a = 1",
        "store s = 0",
        "function g(p)",
        "  local own = p",
        "  return a + own + s + math.abs(p) + f()",
        "end",
        "function f()",
        "  return 0",
        "end",
      ]),
    ).get("g")!;
    expect(listing.slice(0, 2)).toEqual(["SetVar p flags 1", "BindRoot a"]);
    expect(listing.filter((line) => line.startsWith("BindRoot"))).toEqual(["BindRoot a"]);
  });

  // The define's table still captures what the method reads, as it did
  // before the method bound top-level locals, so a closure of the method a
  // save holds passes the parameters the method binds before `BindRoot`.
  test("of a define's method binds them too, after the parameter its table's capture passes", () => {
    const listing = programListing(rootOf(methodReads("local a = 1")));
    expect(listing.filter((line) => line.startsWith("BindRoot"))).toEqual(["BindRoot a"]);
    expect(listing.filter((line) => line.startsWith("VarPtr"))).toEqual(["VarPtr a"]);
    const entry = listing.indexOf("BindRoot a");
    expect(listing.slice(entry - 2, entry)).toEqual(["SetVar self flags 1", "SetVar a flags 1"]);
  });
});

describe("a save written before top-level methods bound top-level locals", () => {
  // `top-level-method-value-save-6053522b8.json` is the save the engine at
  // 6053522b8 wrote of `top-level-method-value.sd` after `First.`: `held`
  // holds the closure of `thing.get` with the capture it was built with.
  test("loads, and a method kept in a variable reads the top-level local", () => {
    const text = readFileSync(join(FIXTURES, "top-level-method-value.sd"), "utf-8");
    const save = readFileSync(join(FIXTURES, "top-level-method-value-save-6053522b8.json"), "utf-8");
    const loaded = new ProgramStory(rootOf([text.trimEnd()]));
    loaded.loadSave(save);
    const { beats, errors } = storyBeats(loaded);
    expect({ texts: beats.map((b) => b.text.trim()), errors }).toEqual(got("Got 3."));
  });
});

describe("a save taken after a function reached a top-level local", () => {
  test("loads into a fresh game, where the function and a closure still share the local", () => {
    const lines = [
      "local a = 1",
      "local f = function() return a end",
      "function inc()",
      "  a = a + 1",
      "  return a",
      "end",
      "-> S",
      "scene S",
      "  First {inc()} {f()}.",
      "  Second {inc()} {f()}.",
      "end",
    ];
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

describe("an incremental compile of a top-level function", () => {
  test.each([
    ["a read of the local added", "  return 0", "  return a", "Got 1."],
    ["a read of the local removed", "  return a", "  return 0", "Got 0."],
    ["the local added above it", "store b = 0", "store b = 0\nlocal a = 1", "Got 1."],
    ["the local removed", "store b = 0\nlocal a = 1", "store b = 0", "Got nil."],
  ])("shows what a cold compile shows after %s", (_, before, after, expected) => {
    const lines = before.startsWith("  ")
      ? ["local a = 1", "function g()", before, "end", "Got {tostring(g())}.", ""]
      : [before, "function g()", "  return a", "end", "Got {tostring(g())}.", ""];
    const session = programSession(lines.join("\n"));
    const root = session.edit(before, after);
    const cold = run([session.text]);
    expect(quiet(() => shown(root))).toEqual(cold);
    expect(cold.texts).toEqual([expected]);
  });
});
