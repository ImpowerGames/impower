// A `>` BREAK marker inside a dialogue (or any display) block splits the
// content into separate BEATS. Each beat must be its own `Continue()` at the
// runtime level so the screenplay preview / planRoute can route to it by its
// own checkpoint — otherwise every dialogue box after the first in a chain is
// unreachable by the preview (the interpreter's `BREAK_BOX_REGEX` still
// renders the boxes, but they collapse onto a single story-path checkpoint).
//
// Routing moved to a per-beat ROUTING TAG (`displayRoutingTag.ts`): the cue is
// NO LONGER in the visible beat text (`Continue()` output) — it lives in the
// beat's `currentTags`. Each continuation re-emits its own routing tag so it
// routes back to the same character's dialogue target. These tests assert BOTH:
// the visible text (cue-free) AND the routing tag (carries the cue).
//
// Run: npx vitest run .../ChainedDialogueBreak.test.ts

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import {
  isDisplayRoutingTag,
  parseDisplayRoutingTag,
} from "../../compiler/utils/displayRoutingTag";

// Drive `Continue()` one line/beat at a time, collecting each beat's visible
// text plus the routing tag emitted for that beat.
function continueBeats(
  story: RuntimeStory,
): { text: string; routing: string | null }[] {
  const beats: { text: string; routing: string | null }[] = [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    const routingTag = (story.currentTags ?? []).find((t) =>
      isDisplayRoutingTag(t),
    );
    const parsed = routingTag ? parseDisplayRoutingTag(routingTag) : null;
    beats.push({
      text,
      routing: parsed ? `${parsed.lineType}:${parsed.identifier}` : null,
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
    // TWO separate Continue() boundaries — each independently routable.
    expect(beats.length).toBe(2);
    // Visible text is cue-free; the cue lives in each beat's routing tag so
    // both beats route to the same character's dialogue target.
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
    // off the continuation line); the cue is carried by the routing tag.
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
    // `>` at end of body is not a split point — it's an extra newline.
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
