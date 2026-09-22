// A display line ends with a newline, and the engine keeps stepping past it to
// learn whether glue removes that newline. Each line's argument must still be
// evaluated once: the look-ahead stops where the next line begins, before that
// line's text is built, rather than building it and throwing it away. A host
// function called from an interpolation is how an author sees the difference.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function countingStory(source: string) {
  const ctx = makeRuntimeStoryFromSource(`external tick()\n${source}`);
  expect(ctx.errorMessages).toEqual([]);
  let calls = 0;
  ctx.story.BindExternalFunction("tick", () => ++calls, true);
  const beats: [string, number][] = [];
  while (ctx.story.canContinue) {
    beats.push([ctx.story.Continue() ?? "", calls]);
  }
  return beats;
}

describe("newline look-ahead evaluates each display line once", () => {
  test("an action line's interpolated host call runs once when the next line is not glued", () => {
    expect(countingStory("First {tick()}.\nSecond {tick()}.\n")).toEqual([
      ["First 1.\n", 1],
      ["Second 2.\n", 2],
    ]);
  });

  test("a dialogue line's interpolated host call runs once when the next line is not glued", () => {
    expect(
      countingStory("ALICE: First {tick()}.\nBOB: Second {tick()}.\n"),
    ).toEqual([
      ["First 1.\n", 1],
      ["Second 2.\n", 2],
    ]);
  });

  test("a glued continuation still joins, and each part's host call runs once", () => {
    expect(
      countingStory("First {tick()} ..\nsecond {tick()}.\nThird {tick()}.\n"),
    ).toEqual([
      ["First 1 second 2.\n", 2],
      ["Third 3.\n", 3],
    ]);
  });

  test("a continuation reached through an `if` still joins", () => {
    expect(
      countingStory(
        "First {tick()} ..\nif true then\n  second {tick()}.\nend\nThird {tick()}.\n",
      ),
    ).toEqual([
      ["First 1 second 2.\n", 2],
      ["Third 3.\n", 3],
    ]);
  });
});
