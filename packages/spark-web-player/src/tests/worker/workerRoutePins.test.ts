// #1657 — the host's pins reach the worker's games, and the line the preview
// shows is shown again by the route the pins make: pinning an option there
// takes it, and clearing the pins goes back to the route the search chooses.
// The line on screen does not move when the pins change, so the display that
// follows is a first display of it, which reports its route, never a repeat
// of the one on screen.
import { SetRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `store trust = 0

scene interrogation
  choose
    * [Tell the truth.]
      trust += 2
    * [Lie.]
      trust -= 1
  end
  HERO:
    Trust is {trust}.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));
const TARGET = lineOf("Trust is");
const LIE = lineOf("[Lie.]");

/** The route the worker's game reports for its display (`game/executed`),
 *  as each choice's kind and text, and the store it holds once the display
 *  is done. */
const shown = (h: any) => {
  const game = h.workerState.gameState.game;
  return {
    decisions: (game.previewRoute?.decisions ?? []).map((d: any) => [
      d.kind,
      d.text,
    ]),
    trust: game.story.variablesState["trust"],
  };
};

const setPins = async (h: any, pins: { uri: string; line: number; offer: number }[]) => {
  await h.controller.handleSetRoutePins(
    SetRoutePinsMessage.type.request({ pins }),
  );
  await settle(40);
};

describe("pins in the worker", () => {
  it("show the line on screen again by the route the pins make, pinned and cleared", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: TARGET },
    });
    try {
      await h.compile();
      await h.select(TARGET);
      await settle(40);
      expect(shown(h)).toEqual({
        decisions: [["auto", "Tell the truth."]],
        trust: 2,
      });

      await setPins(h, [{ uri: MAIN_URI, line: LIE, offer: 1 }]);
      expect(shown(h)).toEqual({ decisions: [["pinned", "Lie."]], trust: -1 });

      await setPins(h, []);
      expect(shown(h)).toEqual({
        decisions: [["auto", "Tell the truth."]],
        trust: 2,
      });
    } finally {
      h.dispose();
    }
  }, 120_000);
});
