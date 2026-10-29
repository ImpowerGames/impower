import { SetRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
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

describe("a line no route reaches", () => {
  const previewWith = async (
    source: string,
    line: number,
    values: Record<string, Record<string, string>>,
  ) => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: source }],
      startFrom: { file: MAIN_URI, line },
    });
    try {
      await (h.controller as any).handleSetStartingValues(
        SetStartingValuesMessage.type.request({ values }),
      );
      await h.compile();
      await h.select(line);
      await settle(40);
      return writtenText(h.toRouter);
    } finally {
      h.dispose();
    }
  };

  it("is shown with the parameters the scene's start takes", async () => {
    const text = await previewWith(
      ["scene s(hour)", "  done", "  After {hour}.", "end", ""].join("\n"),
      2,
      { s: { "param:hour": '"late"' } },
    );
    expect(text).toContain("After late.");
  }, 120_000);

  it("is shown when the values the scene's start takes make it show a beat", async () => {
    const text = await previewWith(
      [
        "store show = false",
        "scene s",
        "  Before.",
        "  done",
        "  if show then",
        "    After.",
        "  end",
        "end",
        "",
      ].join("\n"),
      4,
      { s: { "store:show": "true" } },
    );
    expect(text).toContain("After.");
  }, 120_000);
});

describe("pins on a line whose scene's start takes values", () => {
  const decisionsShown = (h: any) =>
    (h.workerState.gameState.game.previewRoute?.decisions ?? []).map(
      (d: any) => [d.kind, d.text],
    );
  const setPins = async (
    h: any,
    pins: { uri: string; line: number; offer: number }[],
  ) => {
    await h.controller.handleSetRoutePins(
      SetRoutePinsMessage.type.request({ pins }),
    );
    await settle(40);
  };

  it("show the line again by the route the pins make, pinned and cleared", async () => {
    const lines = EXAMPLE.split("\n");
    const target = lines.findIndex((l) => l.includes("I believe you."));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: EXAMPLE }],
      startFrom: { file: MAIN_URI, line: target },
    });
    try {
      await (h.controller as any).handleSetStartingValues(
        SetStartingValuesMessage.type.request({
          values: { interrogation: { "param:hour": '"nine"' } },
        }),
      );
      await h.compile();
      await h.select(target);
      await settle(40);
      expect(lastRoute(h.toEditor)?.start.scene).toBe("interrogation");
      const [kind, taken] = decisionsShown(h)[0];
      expect(kind).toBe("auto");
      const other = taken === "Lie." ? "Tell the truth." : "Lie.";
      const otherLine = lines.findIndex((l) => l.includes(`[${other}]`));

      await setPins(h, [{ uri: MAIN_URI, line: otherLine, offer: 1 }]);
      expect(decisionsShown(h)[0]).toEqual(["pinned", other]);
      expect(writtenText(h.toRouter)).toContain("I believe you.");

      await setPins(h, []);
      expect(decisionsShown(h)[0]?.[0]).toBe("auto");
      expect(writtenText(h.toRouter)).toContain("I believe you.");
      expect(lastRoute(h.toEditor)?.start.scene).toBe("interrogation");
    } finally {
      h.dispose();
    }
  }, 120_000);
});
