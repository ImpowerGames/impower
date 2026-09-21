// A preview the worker's game displays waits for the pictures its beat shows
// before it writes the beat (#680). When a newer selection takes the screen
// over while it waits, the older beat never paints, even once its picture
// arrives: the worker's game lets the older preview go, and the page drops
// whatever the older stream still sends.
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define SPRITE_A as image with
  src = "https://example.com/a.png"
end

define SPRITE_B as image with
  src = "https://example.com/b.png"
end

-> start

scene start
  HERO:
    [[SPRITE_A]]
    The beat that waits for its picture.

  HERO:
    [[SPRITE_B]]
    The beat that takes over.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const WAITING = lineOf("The beat that waits for its picture.");
const TAKING_OVER = lineOf("The beat that takes over.");

describe("a preview displayed from the worker's game", () => {
  it("never paints when a newer one takes over while it waits for its picture", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      expect(h.overlay.textContent).toContain("The beat that takes over.");

      // Everything the page ever shows from here on.
      const painted: string[] = [];
      const Observer = (h.overlay.ownerDocument.defaultView as any).MutationObserver;
      const observer = new Observer(() => painted.push(h.overlay.textContent ?? ""));
      observer.observe(h.overlay, { subtree: true, childList: true, characterData: true });

      const waiting = await h.selectWithoutWaiting(WAITING);
      await settle(40);
      // The older preview is waiting on a.png.
      expect(h.overlay.textContent).not.toContain("The beat that waits for its picture.");

      await h.select(TAKING_OVER);
      releaseA();
      await waiting.previewed;
      await settle(40);
      observer.disconnect();

      expect(h.controller._game).toBeUndefined();
      expect(painted.some((text) => text.includes("The beat that waits for its picture."))).toBe(false);
      expect(h.overlay.textContent).toContain("The beat that takes over.");
      expect(h.controller.getGameState().position).toEqual({ uri: MAIN_URI, line: TAKING_OVER });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("paints once its picture arrives when nothing takes over", async () => {
    let releaseA!: () => void;
    const aLoaded = new Promise<void>((resolve) => (releaseA = resolve));
    const h = await createPlayerHarness({
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TAKING_OVER },
      holdImage: (src) => (src.includes("a.png") ? aLoaded : undefined),
    });
    try {
      await h.compile();
      const waiting = await h.selectWithoutWaiting(WAITING);
      await settle(40);
      expect(h.overlay.textContent).not.toContain("The beat that waits for its picture.");
      releaseA();
      await waiting.previewed;
      await settle(40);
      expect(h.overlay.textContent).toContain("The beat that waits for its picture.");
      expect(h.controller.getGameState().position).toEqual({ uri: MAIN_URI, line: WAITING });
    } finally {
      h.dispose();
    }
  }, 120_000);
});
