import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const play = (line: string) => {
  const { story, errorMessages } = makeRuntimeStoryFromSource(
    [
      "scene start",
      `  ${line}`,
      "  done",
      "end",
      "scene t",
      "  In t.",
      "  ->->",
      "end",
      "scene c",
      "  In c.",
      "  done",
      "end",
      "",
    ].join("\n"),
  );
  expect(errorMessages).toEqual([]);
  let text = "";
  const tags: string[] = [];
  while (story.canContinue) {
    text += story.Continue();
    tags.push(...(story.currentTags ?? []));
  }
  return { text, tags };
};

describe("a tag after an alternator arm's divert", () => {
  test.each([
    ["inline", "x .. queue|-> c # tag|b .. z", "x In c.\n"],
    ["block", "queue | -> c # tag | b end", "In c.\n"],
    ["inline tunnel chain", "x .. queue|-> t -> c # tag|b .. z", "x In t.\nIn c.\n"],
    ["block tunnel chain", "queue | -> t -> c # tag | b end", "In t.\nIn c.\n"],
  ])("%s form loads, plays the divert and keeps the tag", (_form, line, expected) => {
    const untagged = play(line.replace(" # tag", ""));
    const tagged = play(line);
    expect(tagged.text).toBe(untagged.text);
    expect(tagged.text).toBe(expected);
    expect(tagged.tags).toContain("tag");
  });
});
