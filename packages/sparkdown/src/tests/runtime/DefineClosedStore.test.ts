// A `store` below a closed `define` stays a global: the define's `end` stops it
// from taking the line as one of its properties, so `{trust}` reads the stored
// value. See issue #836.
import { expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

test("a store below a closed define stays global", () => {
  const source = [
    "define hero as character with",
    '  name = "Hero"',
    "end",
    "",
    "store trust = 5",
    "",
    "Trust is {trust}.",
    "",
  ].join("\n");
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("Trust is 5.\n");
});
