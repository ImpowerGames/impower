// Text after a tunnel chain (`-> a -> c > After`) or after a divert inside an
// alternator arm (`x .. queue|-> c > y|b .. z`) is stray, as it is after a
// single-target divert: the player follows the same chain and shows the same
// text as it does for the line without the stray text.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const story = (line: string) =>
  makeRuntimeStoryFromSource(
    [
      "-> main",
      "scene main",
      `  ${line}`,
      "  done",
      "",
      "end",
      "scene a",
      "  In a.",
      "  ->->",
      "end",
      "scene b",
      "  In b.",
      "  ->->",
      "end",
      "scene c",
      "  In c.",
      "  done",
      "end",
      "",
    ].join("\n"),
  );

describe("text after a tunnel chain or an arm divert", () => {
  test.each([
    ["-> a -> c > After", "-> a -> c", "In a.\nIn c.\n"],
    ["-> a -> c // note", "-> a -> c", "In a.\nIn c.\n"],
    ["-> a -> b -> > After", "-> a -> b ->", "In a.\nIn b.\n"],
    ["-> a -> > After", "-> a ->", "In a.\n"],
    ["x .. queue|-> c > y|b .. z", "x .. queue|-> c|b .. z", "x In c.\n"],
    [
      "x .. queue|-> a -> c > y|b .. z",
      "x .. queue|-> a -> c|b .. z",
      "x In a.\nIn c.\n",
    ],
    ["queue | -> c > y | b end", "queue | -> c | b end", "In c.\n"],
    ["queue | -> c > blend x | b end", "queue | -> c | b end", "In c.\n"],
    [
      "queue | -> a -> c > y | b end",
      "queue | -> a -> c | b end",
      "In a.\nIn c.\n",
    ],
  ])("%j plays like %j", (line, control, shown) => {
    const withText = story(line);
    const without = story(control);
    expect(withText.errorMessages).toEqual([]);
    expect(withText.errorMessages).toEqual(without.errorMessages);
    expect(withText.warningMessages).toEqual(without.warningMessages);
    expect(withText.story.ContinueMaximally()).toBe(shown);
    expect(without.story.ContinueMaximally()).toBe(shown);
  });
});
