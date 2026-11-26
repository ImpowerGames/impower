import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `Loose words.

scene start
  First.
  Second.
end
`;

const states = (sent: any[]) =>
  sent.filter((m) => m.method === "preview/didChangeGameState").map((m) => m.params);

const FIRST = { kind: "action", words: "First." };

const SECOND = { kind: "action", words: "Second." };

describe("the displayed beat's description on the preview state", () => {
  it("describes the beat on screen until the next preview replaces it, and nothing once none is displayed", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: 3 },
    });
    try {
      await h.compile();
      await h.select(3);
      await settle(40);
      expect(states(h.toEditor).at(-1).shownBeatDescription).toEqual(FIRST);

      const before = h.toEditor.length;
      const { previewed } = await h.selectWithoutWaiting(4);
      const pending = states(h.toEditor.slice(before)).find((s) => s.position == null);
      expect(pending, "the selection is published as pending").toBeDefined();
      expect(pending.shownBeatDescription, "the pending state still describes the beat on screen").toEqual(FIRST);
      await previewed;
      await settle(40);
      const shown = states(h.toEditor).at(-1);
      expect(shown.position).toEqual({ uri: MAIN_URI, line: 4 });
      expect(shown.shownBeatDescription).toEqual(SECOND);

      await h.select(0);
      await settle(40);
      expect(states(h.toEditor).at(-1).shownBeatDescription).toBeNull();
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("describes no beat once PLAY replaces the preview", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: 3 },
      manualClock: true,
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
    try {
      await h.compile();
      await h.select(3);
      await settle(40);
      expect(states(h.toEditor).at(-1).shownBeatDescription).toEqual(FIRST);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      await h.tick(1000 / 60, 60);
      const playing = states(h.toEditor).at(-1);
      expect(playing.launchState).toBe("play");
      expect(playing.shownBeatDescription).toBeNull();
      expect(h.controller.getGameState().shownBeatDescription).toBeNull();
      await h.controller.destroyGameAndApp();
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("describes no beat once the preview is detached", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: 3 },
    });
    try {
      await h.compile();
      await h.select(3);
      await settle(40);
      expect(states(h.toEditor).at(-1).shownBeatDescription).toEqual(FIRST);
      await (h.controller as any).detachWorkerPreview();
      expect(states(h.toEditor).at(-1).shownBeatDescription).toBeNull();
      expect(h.controller.getGameState().shownBeatDescription).toBeNull();
    } finally {
      h.dispose();
    }
  }, 120_000);
});
