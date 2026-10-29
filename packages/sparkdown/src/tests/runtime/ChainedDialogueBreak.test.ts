import { describe, expect, test } from "vitest";
import {
  continueShowedSomething,
  displayRouting,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";
import type { TestStory } from "../engineUnderTest";

function continueBeats(
  story: TestStory,
): { text: string; routing: string | null }[] {
  const beats: { text: string; routing: string | null }[] = [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    if (!continueShowedSomething(story)) continue;
    const routed = displayRouting(story).find((r) => r.target);
    beats.push({
      text,
      routing: routed ? `${routed.target}:${routed.character ?? ""}` : null,
    });
  }
  return beats;
}

describe("chained dialogue `>` break", () => {
  test("a mid-line break splits dialogue into two separate beats, each re-cued", () => {
    const ctx = makeRuntimeStoryFromSource(
      `RAFFLES:
  Different rope! >
  ...I think.
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    const beats = continueBeats(ctx.story);
    expect(beats.length).toBe(2);
    expect(beats[0]).toEqual({
      text: "Different rope!\n",
      routing: "dialogue:RAFFLES",
    });
    expect(beats[1]).toEqual({
      text: "...I think.\n",
      routing: "dialogue:RAFFLES",
    });
  });

  test("a non-chained multi-line dialogue block stays a single beat", () => {
    const ctx = makeRuntimeStoryFromSource(
      `O:
  A meteor.
  Make a wish.
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    const beats = continueBeats(ctx.story);
    expect(beats.length).toBe(1);
    expect(beats[0]).toEqual({
      text: "A meteor.\nMake a wish.\n",
      routing: "dialogue:O",
    });
  });

  test("three-way chain produces three beats", () => {
    const ctx = makeRuntimeStoryFromSource(
      `BUNNY:
  One. >
  Two. >
  Three.
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    const beats = continueBeats(ctx.story);
    expect(beats).toEqual([
      { text: "One.\n", routing: "dialogue:BUNNY" },
      { text: "Two.\n", routing: "dialogue:BUNNY" },
      { text: "Three.\n", routing: "dialogue:BUNNY" },
    ]);
  });

  test("a trailing break (no content after) stays one beat", () => {
    const ctx = makeRuntimeStoryFromSource(`N: one line >\n`);
    expect(ctx.errorMessages).toEqual([]);
    const beats = continueBeats(ctx.story);
    expect(beats.length).toBe(1);
    expect(beats[0]).toEqual({
      text: "one line\n",
      routing: "dialogue:N",
    });
  });
});
