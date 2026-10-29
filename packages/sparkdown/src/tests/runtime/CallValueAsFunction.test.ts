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
