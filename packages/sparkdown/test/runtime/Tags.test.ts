import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromFile } from "./runtimeTestHarness";

function trimmedTags(tags: readonly string[]): string[] {
  return tags.map((t) => t.trim());
}

describe("Tags (ported from inkjs)", () => {
  test("knot/stitch tags", () => {
    const ctx = makeRuntimeStoryFromFile("tags", "knot-stitch-tags");
    expect(ctx.errorMessages).toEqual([]);

    expect(ctx.story.Continue()).toBe("This is the content\n");
    expect(trimmedTags(ctx.story.currentTags ?? [])).toEqual([
      "author: Joe",
      "version: 1.0",
    ]);

    ctx.story.ChoosePathString("knot", true, []);
    expect(ctx.story.Continue()).toBe("Knot content\n");
    expect(trimmedTags(ctx.story.currentTags ?? [])).toEqual(["knot tag"]);
    expect(ctx.story.Continue()).toBe("");
    expect(trimmedTags(ctx.story.currentTags ?? [])).toEqual([
      "end of knot tag",
    ]);
  });

  test("dynamic content in tags (`text # tag {var}{var2}.ext`)", () => {
    const ctx = makeRuntimeStoryFromFile("tags", "dynamic-tags");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("tag\n");
    expect(trimmedTags(ctx.story.currentTags ?? [])).toEqual(["pic8red.jpg"]);
  });

  test("tags in a sequence (per-arm `#tag` annotations)", () => {
    const ctx = makeRuntimeStoryFromFile("tags", "tags-in-sequence");
    expect(ctx.errorMessages).toEqual([]);

    expect(ctx.story.Continue()).toBe("A red sequence.\n");
    expect(trimmedTags(ctx.story.currentTags ?? [])).toEqual(["red"]);

    expect(ctx.story.Continue()).toBe("A white sequence.\n");
    expect(trimmedTags(ctx.story.currentTags ?? [])).toEqual(["white"]);
  });
});
