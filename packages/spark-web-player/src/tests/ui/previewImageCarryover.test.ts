import { describe, expect, test } from "vitest";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

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

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

const TITLE_LINE = lineOf("^: TITLE");
const SHOW_LINE = lineOf("[[show backdrop BG]]");

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
    const h = await withBackdropShowing();
    const before = backdropImages(h.overlay);

    await h.rerender(SOURCE, SHOW_LINE);

    expect(backdropImages(h.overlay)).toEqual(before);
  });
});
