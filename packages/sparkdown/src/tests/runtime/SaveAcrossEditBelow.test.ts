import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

describe("a save loaded into a program edited below it", () => {
  test("resumes at the statement it was saved at", () => {
    const before = makeRuntimeStoryFromSource(
      ["scene start", "  Line one.", "  Line two.", "end", ""].join("\n"),
    );
    expect(before.errorMessages).toEqual([]);
    expect(before.story.Continue()).toBe("Line one.\n");
    const save = before.story.state.ToJson();

    const after = makeRuntimeStoryFromSource(
      ["scene start", "  Line one.", "  Line two.", "  Line three.", "  Line four.", "end", ""].join("\n"),
    );
    expect(after.errorMessages).toEqual([]);
    after.story.state.LoadJson(save);
    expect(runToEnd(after.story)).toBe("Line two.\nLine three.\nLine four.\n");
  });
});
