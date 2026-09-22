// A save loaded into a program edited BELOW the saved position resumes at the
// same statement. The route search resumes from checkpoints taken before the
// first changed statement, and a checkpoint that resumed anywhere else would
// run content the story never reached, in the wrong evaluation mode (#751).
import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

describe("a save loaded into a program edited below it", () => {
  test("resumes at the statement it was saved at", () => {
    const before = makeRuntimeStoryFromSource(
      ["Line one.", "Line two.", ""].join("\n"),
    );
    expect(before.errorMessages).toEqual([]);
    expect(before.story.Continue()).toBe("Line one.\n");
    const save = before.story.state.ToJson();

    const after = makeRuntimeStoryFromSource(
      ["Line one.", "Line two.", "Line three.", "Line four.", ""].join("\n"),
    );
    expect(after.errorMessages).toEqual([]);
    after.story.state.LoadJson(save);
    expect(runToEnd(after.story)).toBe("Line two.\nLine three.\nLine four.\n");
  });
});
