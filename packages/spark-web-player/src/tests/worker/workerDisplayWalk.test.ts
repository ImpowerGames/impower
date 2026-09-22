// Walking the cursor down a scene, as a held arrow key does, leaves the
// preview showing the beat the cursor ended on — in either position of the
// worker-display switch (#680).
import { describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first beat.

  HERO:
    The second beat.

  HERO:
    The third beat.

  HERO:
    The fourth beat.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const BEATS = ["The first beat.", "The second beat.", "The third beat.", "The fourth beat."];

for (const workerDisplays of [false, true]) {
  describe(`with the switch ${workerDisplays ? "on" : "off"}`, () => {
    it("shows the beat the cursor stops on after a walk down the scene", async () => {
      const h = await createPlayerHarness({
        workerDisplays,
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: lineOf(BEATS[0]!) },
      });
      try {
        await h.compile();
        expect(h.overlay.textContent).toContain(BEATS[0]);

        // Each keypress selects the next beat's line without waiting for the
        // preview the one before it started.
        const walking: Promise<unknown>[] = [];
        for (const beat of BEATS.slice(1)) {
          const step = await h.selectWithoutWaiting(lineOf(beat));
          walking.push(step.previewed);
        }
        await Promise.all(walking);
        await settle(60);

        expect(h.overlay.textContent).toContain(BEATS.at(-1));
        expect(h.controller.getGameState().position).toEqual({
          uri: MAIN_URI,
          line: lineOf(BEATS.at(-1)!),
        });
      } finally {
        h.dispose();
      }
    }, 120_000);
  });
}

describe("with the switch on", () => {
  it("never has two displays out at once, however fast the cursor moves", async () => {
    const h = await createPlayerHarness({
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf(BEATS[0]!) },
    });
    try {
      await h.compile();

      // Every display the page asks the worker for, and how many were out at
      // once.
      const asked: number[] = [];
      let out = 0;
      let mostOut = 0;
      const request = h.link.request.bind(h.link);
      (h.link as any).request = (type: any, params: any) => {
        if (type.method !== DisplayPreviewMessage.type.method) {
          return request(type, params);
        }
        asked.push(params.line);
        out += 1;
        mostOut = Math.max(mostOut, out);
        return request(type, params).finally(() => {
          out -= 1;
        });
      };

      // A held arrow key: each selection arrives before the display the one
      // before it started has been worked out.
      const walking: Promise<unknown>[] = [];
      for (const beat of BEATS.slice(1)) {
        const step = await h.selectWithoutWaiting(lineOf(beat));
        walking.push(step.previewed);
      }
      await Promise.all(walking);
      await settle(60);

      // Working a display out is a route replay in the worker, so a second
      // one sent while the first is under way would queue behind it and the
      // screen would fall that far behind the cursor. The selections that
      // arrive meanwhile leave the screen to the newest of them, which asks
      // once the worker is free.
      expect(mostOut).toBe(1);
      expect(asked.at(-1)).toBe(lineOf(BEATS.at(-1)!));
      expect(asked.length).toBeLessThan(BEATS.length - 1);
      expect(h.overlay.textContent).toContain(BEATS.at(-1));
      expect(h.controller.getGameState().position).toEqual({
        uri: MAIN_URI,
        line: lineOf(BEATS.at(-1)!),
      });
    } finally {
      h.dispose();
    }
  }, 120_000);
});
