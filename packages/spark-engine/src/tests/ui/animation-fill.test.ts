// Regression: authored animations inherit `fill: "both"` from default_animation.
//
// An animation authored as `define X as animation with keyframes = {...}` does
// NOT pass through the `default_animation` constructor (only the builtins in
// uiBuiltinDefinitions do), so it reaches `context.animation` with NO `timing`
// block. `getAnimationDefinition` must still default its fill to "both"
// (matching `default_animation`) so the animated end-state PERSISTS — e.g.
// `pan_right` keeps the backdrop panned instead of WAAPI reverting
// `background-position` to its base when the animation completes (fill: "none").
//
// The companion case guards against over-correcting: a builtin that explicitly
// sets `fill: "none"` (e.g. `shake`) must keep "none" — the default is a
// fallback, not a blanket override.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define BG as image with
  src = "https://example.com/bg.png"
end

define pan_right as animation with
  keyframes = {
    background_position = "right"
  }
end

screen main with
  stage:
    backdrop:
      image
end
`;

function story(body: string) {
  return `${DEFS}\n-> start\n\nscene start\n${body}\nend\n`;
}

async function runInstant(body: string) {
  const harness = createHarness(story(body));
  await harness.ready;
  harness.jumpTo("start");
  harness.reset();
  let beat = harness.nextBeat();
  while (beat) {
    await harness.display(beat, true);
    await flushMicrotasks();
    beat = harness.nextBeat();
  }
  return harness;
}

/** Pull the resolved animation for an `[[animate ... with X]]` directive out of
 *  the emitted `ui/write-image` stream. */
function findAnimateAnimation(harness: Awaited<ReturnType<typeof runInstant>>) {
  const writeImage = harness.messages.find((m) => m.method === "ui/write-image");
  expect(writeImage, "expected a ui/write-image message").toBeDefined();
  const animateInstr = writeImage.params.instructions.find(
    (i: any) => i.control === "animate",
  );
  expect(animateInstr, "expected an `animate` instruction").toBeDefined();
  return animateInstr.targetAnimations[0];
}

describe("authored animation fill inheritance", () => {
  test("`define X as animation` with no timing inherits fill: both", async () => {
    const harness = await runInstant(
      `  [[show backdrop BG]]\n  [[animate backdrop with pan_right]]`,
    );
    const anim = findAnimateAnimation(harness);
    expect(anim.$name).toBe("pan_right");
    // The fix: authored animations persist their end state by default, so the
    // backdrop stays panned instead of snapping back.
    expect(anim.timing.fill).toBe("both");
    // The keyframe-wrap: a lone authored keyframe object becomes a one-element
    // array (AnimationPlayer expects an array).
    expect(Array.isArray(anim.keyframes)).toBe(true);
    expect(anim.keyframes).toHaveLength(1);
  });

  test("builtin with explicit fill: none is left unchanged (targeted fallback)", async () => {
    const harness = await runInstant(
      `  [[show backdrop BG]]\n  [[animate backdrop with shake]]`,
    );
    const anim = findAnimateAnimation(harness);
    expect(anim.$name).toBe("shake");
    expect(anim.timing.fill).toBe("none");
  });
});
