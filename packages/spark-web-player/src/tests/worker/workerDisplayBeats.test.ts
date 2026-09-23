// A line that a spaced `>` breaks holds several beats. The preview of the
// line shows its last beat and PLAY from the line starts at its first (#721),
// in either position of the worker-display switch (#680) — including after
// PLAY and STOP have left a route to that line's first beat behind.
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

/** What the preview shows, and the route it took to get there. */
const shown = (h: any) => ({
  text: (h.overlay.textContent ?? "").replace(/\s+/g, " ").trim(),
  path: h.controller.getGameState().executedPath,
});

for (const workerDisplays of [false, true]) {
  describe(`with the switch ${workerDisplays ? "on" : "off"}`, () => {
    it("shows the last beat of a line the cursor stops on", async () => {
      const h = await createPlayerHarness({
        workerDisplays,
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: AFTER },
      });
      try {
        await h.compile();
        await h.select(BROKEN);
        await settle(40);

        // Everything the beats before it did is on the screen, and the beat
        // the preview stops at is the line's last.
        expect(shown(h).text).toContain("Three.");
      } finally {
        h.dispose();
      }
    }, 120_000);

    it("shows the last beat again after PLAY from that line and STOP", async () => {
      const h = await createPlayerHarness({
        workerDisplays,
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: BROKEN },
      });
      try {
        await h.compile();
        await h.select(BROKEN);
        await settle(40);
        const previewed = shown(h).text;
        expect(previewed).toContain("Three.");

        // PLAY starts at the line's FIRST beat, so it plans a route to a
        // different path on the same line.
        expect(await h.controller.startGameAndApp()).toBe(true);
        await settle(40);
        const win = h.overlay.ownerDocument.defaultView as any;
        win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
        await h.controller.stopGame("quit");
        // STOP asks the editor to select where the game stopped; the author's
        // cursor is still on the broken line.
        await h.select(BROKEN);
        await settle(40);

        // The preview is the preview again: the line's last beat, not the
        // first beat PLAY routed to.
        expect(shown(h).text).toContain("Three.");
      } finally {
        h.dispose();
      }
    }, 120_000);
  });
}
