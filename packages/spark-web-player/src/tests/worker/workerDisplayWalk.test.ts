import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
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

describe("a walk down a scene", () => {
  it("shows the beat the cursor stops on after a walk down the scene", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf(BEATS[0]!) },
    });
    try {
      await h.compile();
      expect(h.overlay.textContent).toContain(BEATS[0]);

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

describe("displays waiting their turn", () => {
  it("works out only the last of the displays waiting their turn", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf(BEATS[0]!) },
    });
    try {
      await h.compile();

      const game = h.workerState.gameState.game!;
      const markPreviewing = game.markPreviewing.bind(game);
      let workedOut = 0;
      game.markPreviewing = (address?: ProgramAddress) => {
        workedOut += 1;
        return markPreviewing(address);
      };

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
