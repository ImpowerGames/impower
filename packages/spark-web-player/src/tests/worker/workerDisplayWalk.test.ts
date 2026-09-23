// Walking the cursor down a scene, as a held arrow key does, leaves the
// preview showing the beat the cursor ended on — in either position of the
// worker-display switch (#680).
import { describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { programIdentity } from "../../utils/programIdentity";
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
  it("works out only the last of the displays waiting their turn", async () => {
    const h = await createPlayerHarness({
      workerDisplays: true,
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf(BEATS[0]!) },
    });
    try {
      await h.compile();

      // Every display that is worked out marks the game as previewing before
      // it replays the route to its point, which on a long script is about a
      // second of work.
      const game = h.workerState.gameState.game!;
      const markPreviewing = game.markPreviewing.bind(game);
      let workedOut = 0;
      game.markPreviewing = (path?: string) => {
        workedOut += 1;
        return markPreviewing(path);
      };

      // A held arrow key: every selection's display is sent before the first
      // has been worked out.
      const program = programIdentity(h.controller._program)!;
      const displays = BEATS.slice(1).map((beat) =>
        h.link.request(DisplayPreviewMessage.type, {
          program,
          file: MAIN_URI,
          line: lineOf(beat),
          speculative: false,
        }),
      );
      const results = await Promise.all(displays);
      await settle(60);

      // Only the last was worked out; the rest were replaced while they
      // waited their turn and answered without touching the game.
      expect(workedOut).toBe(1);
      expect(results.map((r: any) => r.displayed)).toEqual([
        ...BEATS.slice(1, -1).map(() => false),
        true,
      ]);
      expect(h.overlay.textContent).toContain(BEATS.at(-1));
    } finally {
      h.dispose();
    }
  }, 120_000);
});
