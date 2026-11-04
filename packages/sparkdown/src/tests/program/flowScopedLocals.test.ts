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

  test("is read in a branch of the scene a divert from the scene enters", () => {
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
    ).toEqual(got("In B 1."));
  });
});

describe("a branch its own scene enters", () => {
  const visit = (body: string[], leave: string) => [
    "scene start",
    "  -> visit(3)",
    "end",
    "scene visit(n)",
    ...body,
    "  branch inner",
    "    Inner {tostring(n)}.",
    `    ${leave}`,
    "  end",
    "end",
  ];

  test("reads the scene's parameter after a divert on the scene's first line", () => {
    expect(run(visit(["  -> visit.inner"], "done"))).toEqual(got("Inner 3."));
  });

  test("reads the scene's parameter after a divert that follows a line", () => {
    expect(run(visit(["  Body {n}.", "  -> visit.inner"], "done"))).toEqual(
      got("Body 3.", "Inner 3."),
    );
  });

  test("reads the scene's parameter after a tunnel, and returns to the scene", () => {
    expect(
      run(visit(["  Body {n}.", "  -> visit.inner ->", "  Back {n}.", "  done"], "->->")),
    ).toEqual(got("Body 3.", "Inner 3.", "Back 3."));
  });

  test("reads the scene's local after a divert from inside a block", () => {
    expect(
      run([
        "scene start",
        "  local a = 7",
        "  if true then",
        "    local b = 1",
        "    -> B",
        "  end",
        "  branch B",
        "    In B {tostring(a)} {tostring(b)}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("In B 7 nil."));
  });

  test("writes the scene's local through a tunnel", () => {
    expect(
      run([
        "scene start",
        "  local a = 1",
        "  -> B ->",
        "  After {a}.",
        "  done",
        "  branch B",
        "    & a = a + 1",
        "    In B {a}.",
        "    ->->",
        "  end",
        "end",
      ]),
    ).toEqual(got("In B 2.", "After 2."));
  });

  test("reads the scene's parameter, not the branch it left, after a divert from a sibling branch", () => {
    expect(
      run([
        "scene start",
        "  -> S(4)",
        "end",
        "scene S(x)",
        "  branch A",
        "    local y = 2",
        "    -> S.C",
        "  end",
        "  branch C",
        "    In C {tostring(x)} {tostring(y)}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("In C 4 nil."));
  });

  test("reads nil for the scene's parameter after a tunnel from another scene", () => {
    expect(
      run([
        "scene start",
        "  -> S(4)",
        "end",
        "scene S(x)",
        "  -> T ->",
        "  done",
        "  branch B",
        "    In B {tostring(x)}.",
        "    ->->",
        "  end",
        "end",
        "scene T",
        "  -> S.B ->",
        "  ->->",
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

  test("a thread into a branch of the spawning scene does not see the scene's locals", () => {
    expect(
      run([
        "scene start",
        "  local x = 3",
        "  <- B",
        "  Back {x}.",
        "  done",
        "  branch B",
        "    B {tostring(x)}.",
        "    done",
        "  end",
        "end",
      ]),
    ).toEqual(got("B nil.", "Back 3."));
  });

  test("a divert after a thread to a label of the same flow keeps the scene's scope", () => {
    expect(
      run([
        "scene start",
        "  local x = 3",
        "  <- middle",
        "  Back {x}.",
        "  done",
        "  label middle",
        "  -> B",
        "  branch B",
        "    B {tostring(x)}.",
        "    done",
        "  end",
        "end",
      ]).texts[0],
    ).toBe("B 3.");
  });
});

describe("a label in a branch its own scene enters", () => {
  test("reads the scene's local after a divert", () => {
    expect(
      run([
        "scene start",
        "  local x = 3",
        "  -> B.middle",
        "  branch B",
        "    Skipped.",
        "    label middle",
        "    B {tostring(x)}.",
        "    done",
        "  end",
        "end",
      ]),
    ).toEqual(got("B 3."));
  });

  test("writes the scene's local through a tunnel", () => {
    expect(
      run([
        "scene start",
        "  local x = 3",
        "  -> B.middle ->",
        "  Back {x}.",
        "  done",
        "  branch B",
        "    Skipped.",
        "    label middle",
        "    B {tostring(x)}.",
        "    & x = x + 1",
        "    ->->",
        "  end",
        "end",
      ]),
    ).toEqual(got("B 3.", "Back 4."));
  });

  test("reads the scene's parameter after a divert from a sibling branch", () => {
    expect(
      run([
        "scene start",
        "  -> S(4)",
        "end",
        "scene S(n)",
        "  -> A",
        "  branch A",
        "    -> B.middle",
        "  end",
        "  branch B",
        "    Skipped.",
        "    label middle",
        "    B {tostring(n)}.",
        "    done",
        "  end",
        "end",
      ]),
    ).toEqual(got("B 4."));
  });
});

describe("a scene's local a branch diverts to", () => {
  test("compiles and reaches the target the scene stored", () => {
    expect(
      run([
        "scene start",
        "  local destination = -> start.C",
        "  -> B",
        "  branch B",
        "    -> destination",
        "  end",
        "  branch C",
        "    Arrived.",
        "    done",
        "  end",
        "end",
      ]),
    ).toEqual(got("Arrived."));
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

  test("written inside a tunnel into the scene's own branch keeps the scene's local shared", () => {
    expect(
      roundTrip([
        "scene start",
        "  local a = 1",
        "  -> B ->",
        "  After {a}.",
        "  done",
        "  branch B",
        "    First {a}.",
        "    & a = a + 1",
        "    Second {a}.",
        "    ->->",
        "  end",
        "end",
      ]),
    ).toEqual({ first: "First 1.", rest: got("Second 2.", "After 2.") });
  });
});
