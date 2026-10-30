import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO: One. > Two. > Three.

  HERO:
    The line after.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const BROKEN = lineOf("One. > Two. > Three.");
const AFTER = lineOf("The line after.");

const shown = (h: any) => ({
  text: (h.overlay.textContent ?? "").replace(/\s+/g, " ").trim(),
  path: h.controller.getGameState().executedPath,
});

describe("a line a spaced > breaks", () => {
  it("shows the last beat of a line the cursor stops on", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    try {
      await h.compile();
      await h.select(BROKEN);
      await settle(40);

      expect(shown(h).text).toContain("Three.");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("shows the last beat again after PLAY from that line and STOP", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: BROKEN },
    });
    try {
      await h.compile();
      await h.select(BROKEN);
      await settle(40);
      const previewed = shown(h).text;
      expect(previewed).toContain("Three.");

      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      const win = h.overlay.ownerDocument.defaultView as any;
      win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
      await h.controller.stopGame("quit");
      await h.select(BROKEN);
      await settle(40);

      expect(shown(h).text).toContain("Three.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});
