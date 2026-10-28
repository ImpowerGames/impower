// #1666 — the Game Preview's routes start with the starting values the host
// keeps for the author, which reach the player with its configuration and
// whenever they change. A change shows the line again with the new values:
// the route searched again from the top of its scene, not one a search
// established before the change.
import { SetStartingValuesMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetStartingValuesMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

const EXAMPLE = `store trust = 0
store suspect = "Ana"
-> interrogation("nine")

scene interrogation(hour)
  INSPECTOR:
    Where were you at {hour}?
  choose
    * [Tell the truth.]
      trust += 2
    * [Lie.]
      trust -= 1
  end
  if trust > 3 then
    INSPECTOR:
      I believe you.
  end
end
`;

/** The route the last `game/executed` report the page heard names. */
const lastRoute = (toEditor: any[]) =>
  toEditor.filter((m) => m.method === "game/executed").at(-1)?.params?.route;

describe("starting values the host sends", () => {
  it("show the line again with the new values", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: EXAMPLE }],
      startFrom: { file: MAIN_URI, line: 6 },
    });
    try {
      await h.compile();
      await h.select(6);
      await settle(40);
      expect(writtenText(h.toRouter)).toContain("Where were you at nine?");

      const sentBefore = h.toRouter.length;
      await (h.controller as any).handleSetStartingValues(
        SetStartingValuesMessage.type.request({
          values: { interrogation: { "param:hour": '"later"' } },
        }),
      );
      await settle(40);
      expect(writtenText(h.toRouter.slice(sentBefore))).toContain(
        "Where were you at later?",
      );
      expect(lastRoute(h.toEditor)?.start.scene).toBe("interrogation");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("route a line again when a store's value makes a forced branch the game's own", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: EXAMPLE }],
      startFrom: { file: MAIN_URI, line: 14 },
    });
    try {
      await (h.controller as any).handleSetStartingValues(
        SetStartingValuesMessage.type.request({
          values: { interrogation: { "param:hour": '"nine"' } },
        }),
      );
      await h.compile();
      await h.select(14);
      await settle(40);
      const kinds = () =>
        lastRoute(h.toEditor)?.decisions.map((d: any) => d.kind);
      expect(kinds()).toEqual(["auto", "forced"]);

      await (h.controller as any).handleSetStartingValues(
        SetStartingValuesMessage.type.request({
          values: {
            interrogation: { "param:hour": '"nine"', "store:trust": "2" },
          },
        }),
      );
      await settle(40);
      expect(kinds()).toEqual(["auto"]);
    } finally {
      h.dispose();
    }
  }, 120_000);
});
