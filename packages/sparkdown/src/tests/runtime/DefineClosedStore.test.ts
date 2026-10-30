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
    "scene start",
    "  Trust is {trust}.",
    "end",
    "",
  ].join("\n");
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  expect(ctx.story.ContinueMaximally()).toBe("Trust is 5.\n");
});
