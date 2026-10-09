// #1433 — an assignment or `local` whose value the parser could not read
// (`& x =` with nothing after the `=`) is reported once by the compiler, and
// the story still runs: the preview runs it and saves its state at every
// step. The assignment assigns nothing and the local is declared nil, so
// every variable holds a value and every save succeeds.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import type { TestStory } from "../engineUnderTest";

const TAIL = "Well, then,\nStory follows.\n";

// Runs the story to its end, saving its state after every step as the
// preview does, and returns what it showed.
function runSavingEachStep(story: TestStory): string {
  let out = "";
  while (story.canContinue) {
    out += story.Continue();
    story.state.toJson();
  }
  return out;
}

// The globals a save of the story holds.
function savedGlobals(story: TestStory): Record<string, unknown> {
  return JSON.parse(story.state.toJson()).variablesState ?? {};
}

describe("an unfinished assignment", () => {
  test.each([
    ["`& x =`", `store x = 0\n& x =\n${TAIL}`],
    ["`& x +=`", `store x = 0\n& x +=\n${TAIL}`],
    ["`& x ..=`", `store x = "a"\n& x ..=\n${TAIL}`],
    ["`& x = )`", `store x = 0\n& x = )\n${TAIL}`],
  ])(
    "%s reports one error, leaves the store as it was and saves",
    (_name, src) => {
      const { story, errorMessages } = makeRuntimeStoryFromSource(src);
      expect(errorMessages).toHaveLength(1);
      const before = String(
        story.state.variablesState.GetVariableWithName("x"),
      );
      expect(runSavingEachStep(story)).toBe(TAIL);
      expect(String(story.state.variablesState.GetVariableWithName("x"))).toBe(
        before,
      );
    },
  );

  test("the statements after it still run and assign", () => {
    const src = `store x = 0\n& x =\n& x = 5\nx is {x}.\n`;
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toHaveLength(1);
    expect(runSavingEachStep(story)).toBe("x is 5.\n");
  });
});

describe("an unfinished `local`", () => {
  test("`& local y =` declares the local nil and saves", () => {
    const src = `& local y =\ny is {y == nil}.\n${TAIL}`;
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toHaveLength(1);
    expect(runSavingEachStep(story)).toBe(`y is true.\n${TAIL}`);
  });

  test("a later assignment assigns the local, not a global", () => {
    const src = `& local y =\n& y = 2\ny is {y}.\n${TAIL}`;
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toHaveLength(1);
    expect(runSavingEachStep(story)).toBe(`y is 2.\n${TAIL}`);
    expect(Object.keys(savedGlobals(story))).not.toContain("y");
  });

  test("`& local p, q =` declares both locals nil and saves", () => {
    const src = `& local p, q =\n& q = 3\np is {p == nil}, q is {q}.\n${TAIL}`;
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toHaveLength(1);
    expect(runSavingEachStep(story)).toBe(`p is true, q is 3.\n${TAIL}`);
    expect(Object.keys(savedGlobals(story))).not.toContain("q");
  });

  test("an unfinished local in a function leaves its caller's values alone", () => {
    const src =
      "function f()\n  local z =\n  return 1\nend\n" +
      "Sum is {10 + f()}.\n";
    const { story, errorMessages } = makeRuntimeStoryFromSource(src);
    expect(errorMessages).toHaveLength(1);
    expect(runSavingEachStep(story)).toBe("Sum is 11.\n");
  });
});
