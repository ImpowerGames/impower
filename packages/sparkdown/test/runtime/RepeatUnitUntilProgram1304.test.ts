import { expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

test.each([
  "store n = 0\nscene start\n  repeat n = n + 1 until n > 3\n  Count {n}.\nend",
  "store n = 0\nscene start\n  repeat\n    n = n + 1\n  until n > 3\n  Count {n}.\nend",
])("repeat-until output remains Count 4 on the program engine (#1304): %s", (text) => {
  const { story, errorMessages } = makeRuntimeStoryFromSource(text);
  expect(errorMessages).toEqual([]);
  expect(story.constructor.name).toBe("TestProgramStory");
  expect(story.ContinueMaximally().trim()).toBe("Count 4.");
});
