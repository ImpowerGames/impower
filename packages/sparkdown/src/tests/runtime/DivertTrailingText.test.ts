// Text after a divert on the same line (`A -> later > After`) is stray: the
// divert ends the line, so the player shows only what the divert leads to,
// exactly as it does for the same line without the trailing text.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const story = (line: string) =>
  makeRuntimeStoryFromSource(`${line}\nscene later\n  Later.\n  fin\n\nend\n`);

describe("text after a divert on the same line", () => {
  test.each([
    ["-> later > After", "-> later"],
    ["-> later more words", "-> later"],
    ["A -> later > After", "A -> later"],
    ["A -> later>After", "A -> later"],
    ["A -> later ! After", "A -> later"],
    ["A -> later more words", "A -> later"],
    ["HERO: Go -> later > After", "HERO: Go -> later"],
  ])("%j plays like %j", (line, control) => {
    const withText = story(line);
    const without = story(control);
    expect(withText.errorMessages).toEqual(without.errorMessages);
    expect(withText.warningMessages).toEqual(without.warningMessages);
    expect(withText.story.ContinueMaximally()).toBe(
      without.story.ContinueMaximally(),
    );
  });
});
