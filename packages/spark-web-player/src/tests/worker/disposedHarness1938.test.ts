import { describe, expect, it } from "vitest";
import { createPlayerHarness, holdFirstInit, MAIN_URI, settle } from "./playerHarness";

const START = "scene start\n  Hello.\nend\n";

const harness = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: START }],
    startFrom: { file: MAIN_URI, line: 1 },
  });
  h.refs.playButton = Object.assign(h.overlay.ownerDocument.createElement("div"), {
    getAnimations: () => [],
  });
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  return h;
};

describe("a disposed player harness", { timeout: 120000 }, () => {
  it("leaves the next harness's first PLAY alone when its restart fires late", async () => {
    const before = await harness();
    try {
      await before.compile();
      expect(await before.controller.startGameAndApp()).toBe(true);
    } finally {
      before.dispose();
    }
    const h = await harness();
    try {
      await h.compile();
      const { release } = holdFirstInit(h);
      const starting = h.controller.startGameAndApp();
      await settle(40);
      await before.controller.restartGame();
      await settle(40);
      release();
      expect(await starting).toBe(true);
      expect(h.controller.playing).toBe(true);
    } finally {
      h.dispose();
    }
  });
});
