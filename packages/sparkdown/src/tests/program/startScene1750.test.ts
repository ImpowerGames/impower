// The story starts in the scene named start, wherever the project declares
// it, and a top-level `run` runs its file with the declarations, before the
// story starts, so every scene a route enters sees the file's globals
// (I-1750, Feature #1749). A `run` inside a scene runs where its line stands.
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
