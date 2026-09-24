// A continue returns at the newline that ends its line. The statements after
// that newline run once, in order, in the next continue: nothing runs ahead of
// the line to find out what follows it, so nothing has to be taken back.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function countingStory(source: string) {
  const ctx = makeRuntimeStoryFromSource(`external tick()\n${source}`);
  expect(ctx.errorMessages).toEqual([]);
  let calls = 0;
  ctx.story.BindExternalFunction("tick", () => ++calls);
  return { story: ctx.story, calls: () => calls };
}

const choiceTexts = (story: { currentChoices: { text: string }[] }) =>
  story.currentChoices.map((choice) => choice.text);

describe("a continue returns at its newline", () => {
  test("a variable assigned between two lines holds its old value after the first continue", () => {
    const ctx = makeRuntimeStoryFromSource(
      `store x = 1\nFirst {x}.\n& x = 2\nSecond {x}.\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("First 1.\n");
    expect(ctx.story.variablesState.$("x")).toBe(1);
    expect(ctx.story.Continue()).toBe("Second 2.\n");
    expect(ctx.story.variablesState.$("x")).toBe(2);
  });

  test("a table written between two lines is written once", () => {
    const { story, calls } = countingStory(
      `store t = { value = 0 }\nFirst.\n& t.value = tick()\nSecond {t.value}.\n`,
    );
    expect(story.Continue()).toBe("First.\n");
    expect(calls()).toBe(0);
    expect(story.Continue()).toBe("Second 1.\n");
    expect(calls()).toBe(1);
  });

  test("a host function called between two lines runs once, in the continue that reaches it", () => {
    const { story, calls } = countingStory(`First.\n& tick()\nSecond.\n`);
    expect(story.Continue()).toBe("First.\n");
    expect(calls()).toBe(0);
    expect(story.Continue()).toBe("Second.\n");
    expect(calls()).toBe(1);
  });

  test("a host function interpolated into consecutive lines is called once per line", () => {
    const { story, calls } = countingStory(
      `First {tick()}.\nSecond {tick()}.\n`,
    );
    expect(story.Continue()).toBe("First 1.\n");
    expect(calls()).toBe(1);
    expect(story.Continue()).toBe("Second 2.\n");
    expect(calls()).toBe(2);
  });
});

describe("choices after a line", () => {
  test("a line before a choose block returns alone, and the next continue raises the choices with no text", () => {
    const ctx = makeRuntimeStoryFromSource(
      `Pick one.\nchoose\n  * One\n  * Two\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick one.\n");
    expect(ctx.story.canContinue).toBe(true);
    expect(choiceTexts(ctx.story)).toEqual([]);
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.canContinue).toBe(false);
    expect(choiceTexts(ctx.story)).toEqual(["One", "Two"]);
  });

  test("a caption inside the block returns with its choices from one continue", () => {
    const ctx = makeRuntimeStoryFromSource(
      `choose\n  Pick one.\n  * One\n  * Two\nend\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Pick one.");
    expect(ctx.story.canContinue).toBe(false);
    expect(choiceTexts(ctx.story)).toEqual(["One", "Two"]);
  });

  // The `-> END` after the line's newline runs in the next continue, which
  // ends the story with no text.
  test("a line followed by `-> END` returns, and the next continue ends the story", () => {
    const ctx = makeRuntimeStoryFromSource(`Last.\n-> END\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("Last.\n");
    expect(ctx.story.canContinue).toBe(true);
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.canContinue).toBe(false);
    expect(choiceTexts(ctx.story)).toEqual([]);
    expect(ctx.story.currentErrors ?? []).toEqual([]);
  });

  test("a line followed by a fallback choice continues into the fallback's body", () => {
    const ctx = makeRuntimeStoryFromSource(
      `First.\nchoose\n  * ->\nthen\n  Second.\nend\n-> END\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.Continue()).toBe("First.\n");
    expect(ctx.story.canContinue).toBe(true);
    expect(ctx.story.Continue()).toBe("Second.\n");
    expect(ctx.story.Continue()).toBe("");
    expect(ctx.story.canContinue).toBe(false);
    expect(ctx.story.currentErrors ?? []).toEqual([]);
  });
});
