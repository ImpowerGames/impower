import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const story = (line: string) =>
  makeRuntimeStoryFromSource(
    [
      "scene start",
      "  for i = 1, 4 do",
      `    ${line}`,
      "  end",
      "  After.",
      "  done",
      "end",
      "",
    ].join("\n"),
  );

describe("a glued alternator with an empty alternative", () => {
  test.each([
    ["They see .. queue | | a dog .. outside.", "They see .. queue | a cat | a dog .. outside.", ["a cat "]],
    ["They see .. queue | a dog | .. outside.", "They see .. queue | a dog | a cat .. outside.", ["a cat "]],
    ["They see .. queue | | .. outside.", "They see .. queue | a cat | a cow .. outside.", ["a cat ", "a cow "]],
    ["It is .. match(1) | | warm .. today.", "It is .. match(1) | cool | warm .. today.", ["cool "]],
    ["It is .. cycle | | warm .. today.", "It is .. cycle | cool | warm .. today.", ["cool "]],
  ])("%j plays like %j without its words", (line, control, words) => {
    const empty = story(line);
    const written = story(control);
    expect(empty.errorMessages).toEqual([]);
    expect(written.errorMessages).toEqual([]);
    expect(empty.warningMessages).toEqual(written.warningMessages);
    const shown = written.story.ContinueMaximally();
    expect(shown).toMatch(/After\.\n$/);
    for (const word of words) expect(shown).toContain(word);
    const expected = words.reduce((text, word) => text.split(word).join(""), shown);
    expect(empty.story.ContinueMaximally()).toBe(expected);
  });
});
