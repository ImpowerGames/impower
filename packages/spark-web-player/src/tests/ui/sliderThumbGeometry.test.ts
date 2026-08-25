// The slider's thumb offset is DERIVED, not chosen.
//
// `appearance: none` collapses the track to its own box, so the thumb has to be
// lifted by half its overhang to sit centred on it: -(thumb - track) / 2. That
// makes the three numbers ONE measurement expressed in three places, and CSS
// gives no way to say so — each is an independent literal that can be edited
// without the others.
//
// Editing one without the others is silent: a thumb sitting a pixel or two off
// its track still looks like a slider. So this test does the subtraction rather
// than asserting the literals -- change a size deliberately and it names the
// offset the new pair requires; change one by accident and it fails.
//
// What it does NOT check is whether those sizes match the reference, and that
// distinction has already mattered here. The thumb and track were both an eighth
// of a rem under Pico's (1.125/0.25 against 1.25/0.375). Since the offset is
// derived from the DIFFERENCE, and both pairs differ by the same 0.875rem, the
// undersized control was perfectly self-consistent -- this test would have
// passed on it, exactly as it passes now. Conformance to the reference is the
// showcase parity measurement's job; this only guarantees that whatever sizes
// are chosen, the thumb is centred on the track.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

const SOURCE = `layout main with
  slider #min=0 #max=100
end
`;

async function builtinCss(): Promise<string> {
  const h = createDOMHarness(SOURCE, 0, { autoOpenAll: true });
  await h.ready;
  await flushMicrotasks(20);
  return [...h.overlay.querySelectorAll("style")]
    .map((s) => s.textContent ?? "")
    .join("\n");
}

/** The body of a nested pseudo-element block inside the `.slider` rule. */
function pseudoBlock(css: string, pseudo: string): string {
  const start = css.indexOf(".slider");
  expect(start, "no `.slider` rule was emitted").toBeGreaterThanOrEqual(0);
  const at = css.indexOf(`&::${pseudo}`, start);
  expect(at, `no \`&::${pseudo}\` block under .slider`).toBeGreaterThanOrEqual(0);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

/** A `rem` (or `px`) length declaration, in px, assuming a 16px root. */
function lengthPx(block: string, prop: string): number {
  const m = block.match(new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*(-?[\\d.]+)(rem|px)`));
  expect(m, `\`${prop}\` was not declared`).toBeTruthy();
  const [, value, unit] = m!;
  return unit === "rem" ? Number(value) * 16 : Number(value);
}

describe("slider thumb geometry", () => {
  test("the thumb's offset centres it on the track it overhangs", async () => {
    const css = await builtinCss();
    const track = pseudoBlock(css, "-webkit-slider-runnable-track");
    const thumb = pseudoBlock(css, "-webkit-slider-thumb");

    const trackHeight = lengthPx(track, "height");
    const thumbHeight = lengthPx(thumb, "height");
    const offset = lengthPx(thumb, "margin-top");

    // The thumb must actually overhang, or there is nothing to correct for and
    // a nonzero offset is pushing it off-centre rather than onto centre.
    expect(thumbHeight).toBeGreaterThan(trackHeight);
    expect(offset).toBeCloseTo(-(thumbHeight - trackHeight) / 2, 5);
  });

  test("the thumb is square, so `border-radius: 50%` draws a circle", async () => {
    const thumb = pseudoBlock(await builtinCss(), "-webkit-slider-thumb");
    // An oval reads as a rendering bug rather than a deliberate shape, and the
    // two sizes are as independently editable as the offset above.
    expect(lengthPx(thumb, "width")).toBe(lengthPx(thumb, "height"));
  });

  test("the thumb's ring is a fixed length, not a typographic one", async () => {
    const thumb = pseudoBlock(await builtinCss(), "-webkit-slider-thumb");
    // Every other size on the control scales with the root font size, which the
    // reference steps up per breakpoint. The ring is a separator, not type: in
    // `rem` it would thicken as the page grew and eat into the thumb's fill.
    expect(thumb).toMatch(/border-width\s*:\s*[\d.]+px/);
  });
});
