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

const lineOf = (state: any) => state?.shownBeat?.range.start.line ?? null;

describe("the displayed beat on the preview state", () => {
  it("names the beat on screen until the next preview replaces it, and nothing once none is displayed", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: 3 },
    });
    try {
      await h.compile();
      await h.select(3);
      await settle(40);
      expect(lineOf(states(h.toEditor).at(-1))).toBe(3);

      const before = h.toEditor.length;
      const { previewed } = await h.selectWithoutWaiting(4);
      const pending = states(h.toEditor.slice(before)).find((s) => s.position == null);
      expect(pending, "the selection is published as pending").toBeDefined();
      expect(lineOf(pending), "the pending state still names the beat on screen").toBe(3);
      await previewed;
      await settle(40);
      const shown = states(h.toEditor).at(-1);
      expect(shown.position).toEqual({ uri: MAIN_URI, line: 4 });
      expect(lineOf(shown)).toBe(4);

      await h.select(0);
      await settle(40);
      expect(states(h.toEditor).at(-1).shownBeat).toBeNull();
    } finally {
      h.dispose();
    }
  }, 120_000);
});
