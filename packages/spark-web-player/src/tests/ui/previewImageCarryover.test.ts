// Previewing a line must show that line's images and nothing else.
//
// Image layers are built by the renderer rather than shipped as `ui/create`
// ops, so they carry no structural id and the reconcile sweep cannot see them.
// They also outlive a beat on purpose — a backdrop stays up until something
// replaces it. Together that meant a re-render whose new point sets no backdrop
// kept showing whatever the previous one had put up: previewing a line near the
// top of a scene came up wearing the backdrop from the line last looked at.

import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

// No `layout main` of its own: the builtin one is what real projects render,
// and its backdrop declares content (`image = transparent`) rather than an
// empty leaf. That distinction is the whole reason this bug is reachable — an
// EMPTY image leaf marks its parent a clear-on-continue transient, which the
// connect already wipes, so a layout written that way never carries a backdrop
// across a re-render and cannot reproduce this.
const SCREEN = `define BG as image with
  src = "https://example.com/bg.png"
end
`;

const SOURCE = `${SCREEN}
-> start

scene start
  ^: TITLE
  [[show backdrop BG]]
  After the backdrop.
end
`;

/** Line index of the first line containing `text`, as the engine numbers them.
 *  Computed rather than counted, so editing the source above cannot silently
 *  point a test at the wrong beat. */
const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

const TITLE_LINE = lineOf("^: TITLE");
const SHOW_LINE = lineOf("[[show backdrop BG]]");

/** The actual pictures on the backdrop. A layer carrying `none` or a flat
 *  colour is the empty content element the layout itself declares, not an
 *  image that was shown. */
function backdropImages(overlay: HTMLElement): string[] {
  const backdrop = overlay.querySelector(".backdrop");
  if (!backdrop) {
    return [];
  }
  const found: string[] = [];
  for (const contentEl of Array.from(backdrop.children)) {
    for (const layer of Array.from(contentEl.children)) {
      const bg = (layer as HTMLElement).style.backgroundImage || "";
      if (bg.includes("url(")) {
        found.push(bg);
      }
    }
  }
  return found;
}

/** Play the scene through, leaving the backdrop up — the state a preview deep
 *  in a scene arrives at. */
async function withBackdropShowing() {
  const h = createDOMHarness(SOURCE);
  await h.ready;
  h.jumpTo("start");
  let beat = h.nextBeat();
  while (beat) {
    await h.display(beat, true);
    await flushMicrotasks();
    beat = h.nextBeat();
  }
  return h;
}

describe("preview image carry-over", () => {
  test("playing through the show puts a backdrop up", async () => {
    // The control for both tests below. If this stops finding a picture they
    // pass for the wrong reason.
    const h = await withBackdropShowing();
    expect(backdropImages(h.overlay).length).toBe(1);
  });

  test("re-rendering at a line before the show drops it", async () => {
    const h = await withBackdropShowing();
    expect(backdropImages(h.overlay).length).toBe(1);

    await h.rerender(SOURCE, TITLE_LINE);

    expect(backdropImages(h.overlay)).toEqual([]);
  });

  test("re-rendering at the show itself keeps it", async () => {
    // The sweep must not clear a target this pass wrote again — and re-writing
    // the picture already on screen takes the dedup early return, which is
    // exactly the path that has to mark the target as still live.
    const h = await withBackdropShowing();
    const before = backdropImages(h.overlay);

    await h.rerender(SOURCE, SHOW_LINE);

    expect(backdropImages(h.overlay)).toEqual(before);
  });
});
