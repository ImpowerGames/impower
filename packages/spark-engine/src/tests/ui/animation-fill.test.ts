// Regression: `define X as animation` inherits the animation type's defaults.
//
// `define X as <type>` is inheritance — X should inherit <type>'s `$default`
// property values. The compiler bakes this into `program.context` (see
// SparkdownCompiler.populateDefinedDefaultProperties): the type's `$default`
// (with `timing.fill: "both"`, easing, etc.) is deep-merged UNDER every
// authored instance. So an authored animation with no `timing` block still
// resolves with `fill: "both"`, and `getAnimationDefinition` reads it straight
// off the struct — no per-consumer default needed.
//
// Without that inheritance, `pan_right` reached the renderer with `fill:"none"`
// and WAAPI reverted `background-position` to base on completion (backdrop
// snapped back instead of staying panned).
//
// Two layers are covered:
//   - compiler: the resolved context struct carries inherited timing (incl. a
//     deep-merge that preserves sibling timing fields under a partial override);
//   - end-to-end: the engine emits that inherited `fill` in the ui/write-image
//     stream, while a builtin's explicit `fill: "none"` (shake) is untouched.

import { describe, expect, test } from "vitest";
import { compileUI, createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const DEFS = `define BG as image with
  src = "https://example.com/bg.png"
end

define pan_right as animation with
  keyframes = {
    background_position = "right"
  }
end

define slow_pan as animation with
  keyframes = {
    background_position = "right"
  }
  timing = {
    duration = "3s"
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

describe("authored define inherits its type's $default (compiler)", () => {
  test("`define X as animation` with no timing inherits the full default timing", () => {
    const { program } = compileUI(story(`  [[show backdrop BG]]`));
    const panRight = (program as any).context?.animation?.["pan_right"];
    expect(panRight).toBeDefined();
    // Inherited from the animation type's $default:
    expect(panRight.timing).toMatchObject({
      delay: 0,
      duration: 0,
      easing: "ease",
      iterations: 1,
      fill: "both",
      direction: "normal",
    });
    expect(panRight.target).toEqual({ $type: "layer", $name: "self" });
    // Authored value is preserved (not clobbered by the default's empty array).
    expect(panRight.keyframes).toMatchObject({ background_position: "right" });
  });

  test("partial `timing` deep-merges: authored field wins, siblings inherited", () => {
    const { program } = compileUI(story(`  [[show backdrop BG]]`));
    const slowPan = (program as any).context?.animation?.["slow_pan"];
    expect(slowPan).toBeDefined();
    expect(slowPan.timing).toMatchObject({
      duration: "3s", // authored override wins
      delay: 0, // inherited
      easing: "ease", // inherited
      iterations: 1, // inherited
      fill: "both", // inherited (the bug: previously dropped)
      direction: "normal", // inherited
    });
  });
});

describe("authored animation fill (end-to-end stream)", () => {
  test("authored `pan_right` reaches the renderer with inherited fill: both", async () => {
    const harness = await runInstant(
      `  [[show backdrop BG]]\n  [[animate backdrop with pan_right]]`,
    );
    const anim = findAnimateAnimation(harness);
    expect(anim.$name).toBe("pan_right");
    // The end state persists, so the backdrop stays panned instead of snapping
    // back. Sourced from the inherited timing, not a consumer-side guess.
    expect(anim.timing.fill).toBe("both");
    // The keyframe-wrap: a lone authored keyframe object becomes a one-element
    // array (AnimationPlayer expects an array).
    expect(Array.isArray(anim.keyframes)).toBe(true);
    expect(anim.keyframes).toHaveLength(1);
  });

  test("builtin with explicit fill: none is left unchanged (shake)", async () => {
    const harness = await runInstant(
      `  [[show backdrop BG]]\n  [[animate backdrop with shake]]`,
    );
    const anim = findAnimateAnimation(harness);
    expect(anim.$name).toBe("shake");
    expect(anim.timing.fill).toBe("none");
  });
});
