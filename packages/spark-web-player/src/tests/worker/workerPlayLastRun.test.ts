import { ChangeRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage";
import { SetRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import { describe, expect, it } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `store trust = 0

scene interrogation
  choose
    * [Knock.]
      HERO:
        Knocked.
    * [Walk in.]
      HERO:
        Walked in.
  end
  INSPECTOR:
    Where were you at nine?
  choose
    * [Tell the truth.]
      trust += 2
    * [Show the photograph.]
      trust += 5
    * [Lie.]
      trust -= 1
  end
  HERO:
    Trust is {trust}.
  choose
    * [Leave.]
      HERO:
        Left.
    * [Stay.]
      HERO:
        Stayed.
  end
  HERO:
    The end.
end
`;

const GATED = `store key = false
store chosen = 0

scene s
  HERO:
    Start here.
  choose
    + if key [Show key.]
      chosen = 1
    + [Wait.]
      chosen = 2
  end
  HERO:
    Result {chosen}.
end
`;

const lineIn = (source: string, text: string) =>
  source.split("\n").findIndex((l) => l.includes(text));
const pinIn = (source: string, text: string, offer = 1) => ({
  uri: MAIN_URI,
  line: lineIn(source, text),
  offer,
});

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

const choose = async (h: any, text: string) => {
  const game = h.playing();
  for (let i = 0; i < 50 && game.story.currentChoices.length === 0; i++) {
    game.clickedToContinue();
    await h.tick(1000 / 60, 2);
  }
  const index = game.story.currentChoices.findIndex(
    (c: { text: string }) => c.text === text,
  );
  expect(index, text).toBeGreaterThanOrEqual(0);
  game.chosePathToContinue(index);
  await h.tick(1000 / 60, 2);
};

const changeRequests = (h: any) =>
  h.toEditor.filter((m: any) => ChangeRoutePinsMessage.type.isRequest(m));

const footButton = (h: any) =>
  [
    ...h.controller.refs.routeList.querySelectorAll(".route-pin-last-run"),
  ][0] as HTMLButtonElement | undefined;

const playerOf = async (source: string, line: number) => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: source }],
    startFrom: { file: MAIN_URI, line },
    manualClock: true,
  });
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) =>
    setTimeout(callback, 0);
  const refs = h.controller.refs;
  refs.routeButton = win.document.createElement("div");
  refs.routeList = win.document.createElement("div");
  refs.leftItems.append(refs.routeButton, refs.locationItems);
  return h;
};

const playAndStop = async (h: any, from: number, choices: string[]) => {
  await h.select(from);
  await settle(40);
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  for (const text of choices) {
    await choose(h, text);
  }
  await h.controller.stopGame("quit");
  await settle(40);
};

describe("PLAY and the pins", () => {
  it("changes no pin and no route, and offers to pin its run as played", async () => {
    const h = await playerOf(SOURCE, lineIn(SOURCE, "Trust is"));
    try {
      await h.compile();
      await h.select(lineIn(SOURCE, "Trust is"));
      await settle(40);
      const before = shown(h);
      expect(before).toEqual({
        decisions: [
          ["auto", "Knock."],
          ["auto", "Tell the truth."],
        ],
        trust: 2,
      });

      await playAndStop(h, lineIn(SOURCE, "Where were you at nine?"), [
        "Lie.",
        "Stay.",
      ]);

      expect(changeRequests(h)).toEqual([]);
      await h.select(lineIn(SOURCE, "Trust is"));
      await settle(40);
      expect(shown(h)).toEqual(before);

      h.controller.setRouteOpen(true);
      await settle(5);
      const button = footButton(h);
      expect(button?.textContent).toBe("Pin the 3 choices from the last run");
      button!.click();
      const [request] = changeRequests(h);
      expect(request.params).toEqual({
        add: [
          pinIn(SOURCE, "[Knock.]"),
          pinIn(SOURCE, "[Lie.]"),
          pinIn(SOURCE, "[Stay.]"),
        ],
        remove: [],
      });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("pinning the run removes a pin on an option a played menu did not offer", async () => {
    const h = await playerOf(GATED, lineIn(GATED, "Result"));
    try {
      await h.compile();
      await h.select(lineIn(GATED, "Result"));
      await settle(40);
      await h.controller.handleSetRoutePins(
        SetRoutePinsMessage.type.request({ pins: [pinIn(GATED, "[Show key.]")] }),
      );
      await settle(40);
      await playAndStop(h, lineIn(GATED, "Start here."), ["Wait."]);
      await h.select(lineIn(GATED, "Result"));
      await settle(40);

      h.controller.setRouteOpen(true);
      await settle(5);
      const button = footButton(h);
      expect(button?.textContent).toBe("Pin the 1 choice from the last run");
      button!.click();
      const [request] = changeRequests(h);
      expect(request.params).toEqual({
        add: [pinIn(GATED, "[Wait.]")],
        remove: [pinIn(GATED, "[Show key.]")],
      });
    } finally {
      h.dispose();
    }
  }, 120_000);
});
