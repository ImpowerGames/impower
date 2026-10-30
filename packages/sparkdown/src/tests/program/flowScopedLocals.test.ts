// A scene's and a branch's locals belong to that flow, as a function's
// belong to the function (#1674): a scene opens a scope of its own and a
// branch one nested in its scene's. A branch the scene falls into reads the
// scene's parameters; a divert into a scene or a branch opens fresh scopes,
// so what the flow declared before is nil there; a tunnel and a thread run
// in scopes of their own. Only a closure written in the flow reads the
// flow's locals, as upvalues; a top-level function and a define's method
// read the global.

import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

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

// The root of a script that compiles with no error.
const rootOf = (lines: string[]): ProgramRoot =>
  quiet(() => {
    const { program } = compileScript([...lines, ""].join("\n"));
    expect(errorsOf(program)).toEqual([]);
    return program.chunks!;
  });

const shown = (story: ProgramStory) => {
  const { beats, errors } = quiet(() => storyBeats(story));
  return { texts: beats.map((b) => b.text.trim()), errors };
};

const run = (lines: string[]) => shown(new ProgramStory(rootOf(lines)));

const got = (...texts: string[]) => ({ texts, errors: [] });

describe("a scene's local", () => {
  test("is nil in another scene", () => {
    expect(
      run([
        "scene start",
        "  local a = 1",
        "  In S {a}.",
        "  -> T",
        "end",
        "scene T",
        "  In T {tostring(a)}.",
        "end",
      ]),
    ).toEqual(got("In S 1.", "In T nil."));
  });

  test("is nil when a divert enters the scene again", () => {
    expect(
      run([
        "store passes = 0",
        "scene start",
        "  -> S",
        "end",
        "scene S",
        "  Seen {tostring(a)}.",
        "  local a = 1",
        "  & passes = passes + 1",
        "  if passes < 2 then",
        "    -> S",
        "  end",
        "end",
      ]),
    ).toEqual(got("Seen nil.", "Seen nil."));
  });

  test("keeps its value across a jump to a label of the scene", () => {
    expect(
      run([
        "scene start",
        "  local a = 0",
        "  label top",
        "  & a = a + 1",
        "  if a < 3 then",
        "    -> top",
        "  end",
        "  Counted {a}.",
        "end",
      ]),
    ).toEqual(got("Counted 3."));
  });

  test("is nil in a branch of the scene a divert from another scene enters", () => {
    expect(
      run([
        "scene S",
        "  local a = 1",
        "  branch B",
        "    In B {tostring(a)}.",
        "  end",
        "end",
        "scene start",
        "  local a = 2",
        "  -> S.B",
        "end",
      ]),
    ).toEqual(got("In B nil."));
  });

  test("is nil in a branch of the scene a divert from the scene enters", () => {
    expect(
      run([
        "scene start",
        "  local a = 1",
        "  -> B",
        "  branch B",
        "    In B {tostring(a)}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("In B nil."));
  });
});

describe("a scene a host evaluates", () => {
  test("keeps its locals out of the scene it diverts to", () => {
    const story = new ProgramStory(
      rootOf(["scene start", "end", "scene A", "  local value = 12", "  -> B", "end", "scene B", "  Other {tostring(value)}.", "end"]),
    );
    const result = quiet(() => story.EvaluateFunction("A", [], true)) as { output: string };
    expect(result.output.trim()).toBe("Other nil.");
  });
});

describe("a branch the scene falls into", () => {
  test("reads the scene's parameter, a local of the scene's scope", () => {
    expect(
      run(["scene start", "  -> S(5)", "end", "scene S(x)", "  branch B", "    In B {tostring(x)}.", "  end", "end"]),
    ).toEqual(got("In B 5."));
  });
});

describe("a closure written in the scene", () => {
  test("reads and writes the scene's local", () => {
    expect(
      run([
        "scene start",
        "  local a = 1",
        "  local get = function() return a end",
        "  local set = function(v) a = v end",
        "  & set(7)",
        "  Got {get()} {a}.",
        "end",
      ]),
    ).toEqual(got("Got 7 7."));
  });

  test("written as a local function reads and writes the scene's local", () => {
    expect(
      run([
        "scene start",
        "  local a = 1",
        "  local function bump()",
        "    a = a + 1",
        "    return a",
        "  end",
        "  Got {bump()} {bump()} {a}.",
        "end",
      ]),
    ).toEqual(got("Got 2 3 3."));
  });

  test("reads a scene's local named like a scene, not that scene's visit count", () => {
    expect(
      run([
        "scene start",
        "  local T = 5",
        "  local get = function() return T end",
        "  local function peek() return T end",
        "  Got {get()} {peek()} {T}.",
        "end",
        "scene T",
        "  Visited.",
        "end",
      ]),
    ).toEqual(got("Got 5 5 5."));
  });

  test("calls an attributed local function of the scene named like a stdlib namespace", () => {
    expect(
      run([
        "scene start",
        "  @native local function math() return 7 end",
        "  local f = function() return math() end",
        "  Got {f()} {math()}.",
        "end",
      ]),
    ).toEqual(got("Got 7 7."));
  });

  test("keeps the local it captured after the flow diverts away", () => {
    expect(
      run([
        "store keep = nil",
        "scene start",
        "  local a = 4",
        "  & keep = function() return a end",
        "  -> T",
        "end",
        "scene T",
        "  local a = 9",
        "  Kept {keep()} {a}.",
        "end",
      ]),
    ).toEqual(got("Kept 4 9."));
  });
});

describe("a function and a define's method written at the top level", () => {
  test("read the global of a name a scene declares a local of", () => {
    expect(
      run([
        "function get()",
        "  return tostring(a)",
        "end",
        "define thing with",
        "  function read()",
        "    return tostring(a)",
        "  end",
        "end",
        "scene start",
        "  local a = 1",
        "  Got {get()} {thing.read()} {a}.",
        "end",
      ]),
    ).toEqual(got("Got nil nil 1."));
  });
});

describe("a tunnel and a thread", () => {
  test("a tunnel returned from leaves the scene's locals as they were", () => {
    expect(
      run([
        "scene start",
        "  local a = 1",
        "  -> T ->",
        "  After {a}.",
        "end",
        "scene T",
        "  Before {tostring(a)}.",
        "  local a = 2",
        "  In T {a}.",
        "  ->->",
        "end",
      ]),
    ).toEqual(got("Before nil.", "In T 2.", "After 1."));
  });

  test("a thread does not see the spawning scene's locals", () => {
    expect(
      run([
        "scene start",
        "  local a = 1",
        "  <- T",
        "  After {a}.",
        "end",
        "scene T",
        "  Thread {tostring(a)}.",
        "  done",
        "end",
      ]),
    ).toEqual(got("Thread nil.", "After 1."));
  });
});

describe("a save", () => {
  const roundTrip = (lines: string[]) => {
    const story = new ProgramStory(rootOf(lines));
    story.onError = () => {};
    const first = quiet(() => story.Continue())?.trim();
    const save = quiet(() => story.toSave());
    const loaded = new ProgramStory(rootOf(lines));
    quiet(() => loaded.loadSave(save));
    return { first, rest: shown(loaded) };
  };

  test("written inside a scene round-trips its locals", () => {
    expect(
      roundTrip([
        "scene start",
        "  local a = 3",
        "  local f = function() return a end",
        "  First {a}.",
        "  & a = a + 1",
        "  Second {a} {f()}.",
        "end",
      ]),
    ).toEqual({ first: "First 3.", rest: got("Second 4 4.") });
  });

  test("written inside a branch round-trips the scene's and the branch's locals", () => {
    expect(
      roundTrip([
        "scene start",
        "  -> S(2)",
        "end",
        "scene S(x)",
        "  branch B",
        "    local b = x * 10",
        "    First {x} {b}.",
        "    & b = b + 1",
        "    Second {x} {b}.",
        "  end",
        "end",
      ]),
    ).toEqual({ first: "First 2 20.", rest: got("Second 2 21.") });
  });
});
