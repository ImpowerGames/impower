// A continue returns at the newline that ends its line, so each display
// line's argument is evaluated once, by the continue that shows it. A host
// function called from an interpolation is how an author sees that.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function countingStory(source: string) {
  const ctx = makeRuntimeStoryFromSource(`external tick()\n${source}`);
  expect(ctx.errorMessages).toEqual([]);
  let calls = 0;
  ctx.story.BindExternalFunction("tick", () => ++calls);
  const beats: [string, number][] = [];
  while (ctx.story.canContinue) {
    beats.push([ctx.story.Continue() ?? "", calls]);
  }
  return beats;
}

describe("each display line is evaluated once", () => {
  test("an action line's interpolated host call runs once when the next line is not glued", () => {
    expect(countingStory("First {tick()}.\nSecond {tick()}.\n")).toEqual([
      ["First 1.\n", 1],
      ["Second 2.\n", 2],
      ["", 2],
    ]);
  });

  test("a dialogue line's interpolated host call runs once when the next line is not glued", () => {
    expect(
      countingStory("ALICE: First {tick()}.\nBOB: Second {tick()}.\n"),
    ).toEqual([
      ["First 1.\n", 1],
      ["Second 2.\n", 2],
      ["", 2],
    ]);
  });

  test("a glued continuation still joins, and each part's host call runs once", () => {
    expect(
      countingStory("First {tick()} ..\n.. second {tick()}.\nThird {tick()}.\n"),
    ).toEqual([
      ["First 1 second 2.\n", 2],
      ["Third 3.\n", 3],
      ["", 3],
    ]);
  });

  test("a continuation reached through an `if` still joins", () => {
    expect(
      countingStory(
        "First {tick()} ..\nif true then\n  .. second {tick()}.\nend\nThird {tick()}.\n",
      ),
    ).toEqual([
      ["First 1 second 2.\n", 2],
      ["Third 3.\n", 3],
      ["", 3],
    ]);
  });
});
