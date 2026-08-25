// The interface module remembers which images are displayed so that restoring a
// position can put the screen back. Nothing resets that record between preview
// points — during a real run a backdrop is meant to outlive the beat that set
// it — so a preview whose replay sets no backdrop inherited the previous one's.
//
// `forgetDisplayedImages` is what the editor calls before it connects a fresh
// preview, so restore only re-applies what the new point genuinely has.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const SOURCE = `define BG as image with
  src = "https://example.com/bg.png"
end

layout main with
  stage:
    backdrop:
      image
  textbox:
    dialogue:
      text
end

-> start

scene start
  [[show backdrop BG]]
  After the backdrop.
end
`;

/** Play the beat that puts the backdrop up. */
async function withBackdropShowing() {
  const h = createHarness(SOURCE);
  await h.ready;
  h.jumpTo("start");
  const beat = h.nextBeat();
  await h.display(beat!, /* instant */ true);
  await flushMicrotasks();
  return h;
}

const imageWrites = (h: { snapshotFiltered: (p: string) => unknown[] }) =>
  h.snapshotFiltered("ui/write-image");

describe("forgetting displayed images", () => {
  test("showing a backdrop records it", async () => {
    const h = await withBackdropShowing();
    const ui: any = h.game.module.ui;
    expect(Object.keys(ui._state.image ?? {})).toContain("backdrop");
  });

  test("restore re-applies the recorded image", async () => {
    // The control. Restore putting the screen back is the whole reason the
    // record exists, and it must keep working for a checkpoint that has one.
    const h = await withBackdropShowing();
    const ui: any = h.game.module.ui;
    h.reset();
    await ui.onRestore();
    await flushMicrotasks();
    expect(imageWrites(h).length).toBeGreaterThan(0);
  });

  test("forgetting first leaves restore with nothing to re-apply", async () => {
    const h = await withBackdropShowing();
    const ui: any = h.game.module.ui;
    ui.forgetDisplayedImages();
    expect(ui._state.image).toBeUndefined();
    h.reset();
    await ui.onRestore();
    await flushMicrotasks();
    expect(imageWrites(h)).toEqual([]);
  });
});
