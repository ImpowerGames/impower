// Pressure-test for calling a value as a function: a function whose target is
// a value on the evaluation stack at runtime (as opposed to a
// compile-time-bound name).
//
// The function `double` is called through a local that holds it, with 5, and
// the story prints what it returns, "10". A value that is not a function
// raises Luau's error when it is called.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

describe("calling a value as a function", () => {
  test("dispatches to the function the value holds", () => {
    const { story, errorMessages } = makeRuntimeStoryFromSource(
      [
        "function double(x)",
        "  return x * 2",
        "end",
        "function run()",
        "  local f = double",
        "  return f(5)",
        "end",
        "{run()}",
        "",
      ].join("\n"),
    );
    expect(errorMessages).toEqual([]);
    expect(story.ContinueMaximally().trim()).toBe("10");
  });

  test("throws on a value that is not a function", () => {
    const { story, errorMessages } = makeRuntimeStoryFromSource(
      [
        "function run()",
        '  local f = "not a target"',
        "  return f()",
        "end",
        "{run()}",
        "",
      ].join("\n"),
    );
    expect(errorMessages).toEqual([]);
    expect(() => story.ContinueMaximally()).toThrow(/attempt to call a \w+ value/);
  });
});
