import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const play = (declaration: string) => {
  const { story, errorMessages } = makeRuntimeStoryFromSource(
    [
      "store calls = 0",
      declaration,
      "function bump()",
      "  calls = calls + 1",
      "  return 2",
      "end",
      "scene start",
      "  Value {x} {calls}.",
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

  test("runs them in source order", () => {
    const { story, errorMessages } = makeRuntimeStoryFromSource(
      [
        "store calls = 0",
        "store x = 1, first(), second()",
        "function first()",
        "  calls = calls * 10 + 1",
        "end",
        "function second()",
        "  calls = calls * 10 + 2",
        "end",
        "scene start",
        "  Value {calls}.",
        "end",
        "",
      ].join("\n"),
    );
    expect(errorMessages).toEqual([]);
    expect(story.ContinueMaximally()).toBe("Value 12.\n");
  });
});
