import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { errorsOf, programCompiler, storyRun } from "./programHarness";

const ROOT = "file://proj/";
const MAIN = `${ROOT}main.sd`;
const OTHER = `${ROOT}scripts/opening.sd`;
const HELPERS = `${ROOT}helpers.luau`;
const STEP = `${ROOT}step.luau`;

const quiet = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const lines = (...text: string[]) => [...text, ""].join("\n");

const storyOf = (texts: Record<string, string>): ProgramStory => {
  const { program } = quiet(() => programCompiler(texts).compile(MAIN));
  expect(errorsOf(program)).toEqual([]);
  return new ProgramStory(program.chunks!);
};

const beatsOf = (story: ProgramStory, from?: string) => {
  const run = quiet(() => storyRun(story, [], { from }));
  expect(run.errors).toEqual([]);
  return run.beats.map((beat) => beat.text);
};

describe("the start of the story", () => {
  it("begins in a start scene another script declares, not at main's first scene", () => {
    const story = storyOf({
      [MAIN]: lines("scene forest", "  The forest.", "end"),
      [OTHER]: lines("scene start", "  The gate.", "  -> forest", "end"),
    });
    expect(beatsOf(story)).toEqual(["The gate.\n", "The forest.\n"]);
  });

  const counted = {
    [MAIN]: lines(
      "scene start",
      "  Visits {count.visits(-> start)}, turns {count.turns(-> start)}.",
      "end",
    ),
  };

  it("counts start as entered when the story starts there", () => {
    expect(beatsOf(storyOf(counted))).toEqual(["Visits 1, turns 0.\n"]);
  });

  it("counts start once when a reset is followed by a jump into it", () => {
    const story = storyOf(counted);
    story.ResetState();
    expect(beatsOf(story, "start")).toEqual(["Visits 1, turns 0.\n"]);
  });

  it("enters the first branch of a start scene that opens with one", () => {
    const story = storyOf({
      [MAIN]: lines(
        "scene start",
        "  branch opening",
        "    The opening, {count.visits(-> start)}.",
        "  end",
        "end",
      ),
    });
    expect(beatsOf(story)).toEqual(["The opening, 1.\n"]);
  });

  it("gives start's locals the scene's scope", () => {
    const story = storyOf({
      [MAIN]: lines(
        "scene start",
        "  local n = 2",
        "  if n > 1 then",
        "    local m = n * 2",
        "    Inner {m}.",
        "  end",
        "  Outer {n}.",
        "end",
      ),
    });
    expect(beatsOf(story)).toEqual(["Inner 4.\n", "Outer 2.\n"]);
  });

  const branchFirst = {
    [MAIN]: lines(
      "function helper() return 7 end",
      "scene start",
      "  branch opening",
      "    The opening, {count.visits(-> start)}.",
      "  end",
      "end",
    ),
  };

  it("still enters start after a save of the state before its first step", () => {
    const plain = storyOf(counted);
    quiet(() => plain.toSave());
    expect(beatsOf(plain)).toEqual(["Visits 1, turns 0.\n"]);
    const story = storyOf(branchFirst);
    quiet(() => story.toSave());
    expect(beatsOf(story)).toEqual(["The opening, 1.\n"]);
  });

  it("enters start from a load of a save of the state before its first step", () => {
    for (const texts of [counted, branchFirst]) {
      const save = quiet(() => storyOf(texts).toSave());
      const story = storyOf(texts);
      quiet(() => story.loadSave(save));
      expect(beatsOf(story)).toEqual(
        texts === counted ? ["Visits 1, turns 0.\n"] : ["The opening, 1.\n"],
      );
    }
  });

  it("still enters start after the host evaluates a function before its first step", () => {
    const story = storyOf(branchFirst);
    expect(quiet(() => story.EvaluateFunction("helper"))).toBe(7);
    expect(beatsOf(story)).toEqual(["The opening, 1.\n"]);
  });
});

describe("a top-level declaration after a scene", () => {
  it("writes a member function with the declarations, not in the scene above it", () => {
    const story = storyOf({
      [MAIN]: lines(
        "store api = {}",
        "scene unused",
        "  Unused.",
        "end",
        "function api.f() return 3 end",
        "scene start",
        "  Answer {api.f()}.",
        "end",
      ),
    });
    expect(beatsOf(story)).toEqual(["Answer 3.\n"]);
  });

  it("writes another script's member function after a scene with the declarations", () => {
    const story = storyOf({
      [MAIN]: lines("store api = {}", "scene start", "  Answer {api.f()}.", "end"),
      [OTHER]: lines("scene unused", "  Unused.", "end", "function api.f() return 3 end"),
    });
    expect(beatsOf(story)).toEqual(["Answer 3.\n"]);
  });
});

describe("a const function at the top level of a Luau file a top-level run loads", () => {
  it("reads the file's locals", () => {
    const story = storyOf({
      [MAIN]: lines('run "helpers"', "scene start", "  Result {result}.", "end"),
      [HELPERS]: lines("local n = 7", "const function f() return n end", "result = f()"),
    });
    expect(beatsOf(story)).toEqual(["Result 7.\n"]);
  });
});

describe("a top-level run", () => {
  const project = {
    [MAIN]: lines(
      "store base = 10",
      "run helpers",
      "scene start",
      "  Loaded {loads} with {derived}.",
      "  -> forest",
      "end",
      "scene forest",
      "  {greet()} from the forest.",
      "end",
    ),
    [HELPERS]: lines(
      "loads = (loads or 0) + 1",
      "derived = base + 1",
      "function greet() return \"Hi\" end",
    ),
  };

  it("runs its file once, after the script's stores and before start's first line", () => {
    const story = storyOf(project);
    expect(beatsOf(story)).toEqual(["Loaded 1 with 11.\n", "Hi from the forest.\n"]);
  });

  it("runs its file once again for each fresh start of the story", () => {
    const story = storyOf(project);
    beatsOf(story);
    story.ResetState();
    expect(beatsOf(story)).toEqual(["Loaded 1 with 11.\n", "Hi from the forest.\n"]);
  });

  it("gives a route into another scene the file's globals", () => {
    const story = storyOf(project);
    expect(beatsOf(story, "forest")).toEqual(["Hi from the forest.\n"]);
  });

  it("stops the compile at its line when its file raises an error, as a store's initializer does", () => {
    const { program } = quiet(() =>
      programCompiler({
        [MAIN]: lines("store base = 1", "run helpers", "scene start", "  After.", "end"),
        [HELPERS]: lines('error("the helper failed")'),
      }).compile(MAIN),
    );
    const errors = errorsOf(program);
    expect(errors.map(([line]) => line)).toEqual([1]);
    expect(errors[0]![1]).toContain("the helper failed");
  });

  it("runs a run inside a scene where its line stands", () => {
    const story = storyOf({
      [MAIN]: lines(
        "store n = 0",
        "scene start",
        "  Before {n}.",
        "  run step",
        "  After {n}.",
        "  run step",
        "  Last {n}.",
        "end",
      ),
      [STEP]: lines("n = n + 1"),
    });
    expect(beatsOf(story)).toEqual(["Before 0.\n", "After 1.\n", "Last 2.\n"]);
  });
});
