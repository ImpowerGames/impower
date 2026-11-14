import type { GameState } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { describe, expect, it } from "vitest";
import { OUTSIDE_EVERY_SCENE_REFUSAL } from "../../main/workers/messages/PlayMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const NOTES_URI = MAIN_URI.replace(/main\.sd$/, "notes.sd");

const MAIN = `scene start
  The lamps come on one by one.
  done
end
`;

const NOTES = `layout tint0 { text #--colors=#ff8800 }
layout tint1 { text #--colors=#3366ff }
`;

const lastGameState = (sent: any[]): GameState | undefined =>
  sent.filter((m) => m.method === "preview/didChangeGameState").at(-1)?.params;

describe("the start refusal the player reports for the caret's line", () => {
  it("refuses PLAY at a layout line in a script with no scene, while the preview keeps showing the story's beat", async () => {
    const h = await createPlayerHarness({
      files: [
        { uri: MAIN_URI, text: MAIN },
        { uri: NOTES_URI, text: NOTES },
      ],
      startFrom: { file: MAIN_URI, line: 1 },
    });
    try {
      await h.compile();
      await h.select(1);
      await settle(40);
      expect(lastGameState(h.toEditor)?.startRefusal ?? null).toBeNull();
      expect(h.controller.getGameState().startRefusal ?? null).toBeNull();

      await h.select(0, NOTES_URI);
      await settle(40);
      expect(h.overlay.textContent).toContain("The lamps come on one by one.");
      expect(lastGameState(h.toEditor)?.startRefusal).toBe(
        OUTSIDE_EVERY_SCENE_REFUSAL,
      );
      expect(h.controller.getGameState().startRefusal).toBe(
        OUTSIDE_EVERY_SCENE_REFUSAL,
      );

      await h.select(1);
      await settle(40);
      expect(lastGameState(h.toEditor)?.startRefusal ?? null).toBeNull();
    } finally {
      h.dispose();
    }
  }, 120_000);
});
