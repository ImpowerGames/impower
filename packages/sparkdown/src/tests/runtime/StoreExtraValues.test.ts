// #1333 — a `store` evaluates every value of its list, in order, binds the
// first to its first name and later ones to later names, and drops the rest,
// as Luau does: `store x = 1, bump()` calls `bump` when the story starts.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const play = (declaration: string) => {
  const { story, errorMessages } = makeRuntimeStoryFromSource(
    [
      "store calls = 0",
      declaration,
      "Value {x} {calls}.",
      "function bump()",
      "  calls = calls + 1",
      "  return 2",
      "end",
      "",
    ].join("\n"),
  );
  expect(errorMessages).toEqual([]);
  return story.ContinueMaximally();
};

describe("a store's values after its last name", () => {
  test.each([
    ["store x = 1, bump()", "Value 1 1.\n"],
    ["store x, y = 1, bump()", "Value 1 1.\n"],
    ["store x = bump(), 1", "Value 2 1.\n"],
    ["store x, y = 1, 2, bump()", "Value 1 1.\n"],
  ])("%s runs every value", (declaration, expected) => {
    expect(play(declaration)).toBe(expected);
  });
});
