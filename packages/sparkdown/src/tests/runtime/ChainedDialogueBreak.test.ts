// A `>` BREAK marker inside a dialogue (or any display) block splits the
// content into separate BEATS. Each beat must be its own `Continue()` at the
// runtime level so the screenplay preview / planRoute can route to it by its
// own checkpoint — otherwise every dialogue box after the first in a chain is
// unreachable by the preview (the interpreter's `BREAK_BOX_REGEX` still
// renders the boxes, but they collapse onto a single story-path checkpoint).
//
// Each continuation re-emits the character cue prefix so it routes back to the
// same character's dialogue target.
//
// Run: npx vitest run .../ChainedDialogueBreak.test.ts

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

// Drive `Continue()` one line/beat at a time, collecting each beat's text.
function continueBeats(story: RuntimeStory): string[] {
  const beats: string[] = [];
  while (story.canContinue) {
    beats.push(story.Continue() ?? "");
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
    // TWO separate Continue() boundaries — each independently routable.
    expect(beats.length).toBe(2);
    // Both beats carry the `RAFFLES:` cue prefix so they route to the same
    // character's dialogue target.
    expect(beats[0]).toBe("RAFFLES: Different rope!\n");
    expect(beats[1]).toBe("RAFFLES: ...I think.\n");
  });

  test("a non-chained multi-line dialogue block stays a single beat", () => {
    // No break marker → one box, one Continue (the lines join with `\n `).
    const ctx = makeRuntimeStoryFromSource(
      `O:
  A meteor.
  Make a wish.
`,
    );
    expect(ctx.errorMessages).toEqual([]);
    const beats = continueBeats(ctx.story);
    expect(beats.length).toBe(1);
    // The two lines join into one beat (the runtime trims the leading space
    // off the continuation line).
    expect(beats[0]).toBe("O: A meteor.\nMake a wish.\n");
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
      "BUNNY: One.\n",
      "BUNNY: Two.\n",
      "BUNNY: Three.\n",
    ]);
  });

  test("a trailing break (no content after) stays one beat", () => {
    // `>` at end of body is not a split point — it's an extra newline.
    const ctx = makeRuntimeStoryFromSource(`N: one line >\n`);
    expect(ctx.errorMessages).toEqual([]);
    const beats = continueBeats(ctx.story);
    expect(beats.length).toBe(1);
    expect(beats[0]).toBe("N: one line\n");
  });
});
