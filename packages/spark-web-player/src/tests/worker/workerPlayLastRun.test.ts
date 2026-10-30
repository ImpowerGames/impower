import { ChangeRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage";
import { SetRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import { describe, expect, it } from "vitest";
import { LAST_RUN_CHANGED } from "../../route/routeView";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `store trust = 0

scene start
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

scene start
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

const UNREACHED = `scene start
  choose
    * [Alpha.]
      HERO:
        Alpha said.
    * [Beta.]
      HERO:
        Beta said.
  end
  HERO:
    Shared line.
end

scene other
  HERO:
    Before.
  done
  HERO:
    Jump start.
  choose
    * [New.]
      HERO:
        New said.
  end
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

const pressFoot = async (h: any) => {
  h.controller.setRouteOpen(true);
  await settle(5);
  const button = footButton(h);
  const text = button?.textContent ?? null;
  button?.click();
  await settle(40);
  return { text, requests: changeRequests(h) };
};

const setPins = async (h: any, pins: ReturnType<typeof pinIn>[]) => {
  await h.controller.handleSetRoutePins(SetRoutePinsMessage.type.request({ pins }));
  await settle(40);
};

const insertAtTop = async (h: any, text: string) => {
  await h.edit([
    {
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      text,
    },
  ]);
  await h.compile();
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

      const { text, requests } = await pressFoot(h);
      expect(text).toBe("Pin the 3 choices from the last run");
      expect(requests.map((r: any) => r.params)).toEqual([
        {
          add: [
            pinIn(SOURCE, "[Knock.]"),
            pinIn(SOURCE, "[Lie.]"),
            pinIn(SOURCE, "[Stay.]"),
          ],
          remove: [],
        },
      ]);
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
      await setPins(h, [pinIn(GATED, "[Show key.]")]);
      await playAndStop(h, lineIn(GATED, "Start here."), ["Wait."]);
      await h.select(lineIn(GATED, "Result"));
      await settle(40);

      const { text, requests } = await pressFoot(h);
      expect(text).toBe("Pin the 1 choice from the last run");
      expect(requests.map((r: any) => r.params)).toEqual([
        { add: [pinIn(GATED, "[Wait.]")], remove: [pinIn(GATED, "[Show key.]")] },
      ]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("pinning the run removes a pin added to that menu after the run", async () => {
    const h = await playerOf(GATED, lineIn(GATED, "Result"));
    try {
      await h.compile();
      await h.select(lineIn(GATED, "Result"));
      await settle(40);
      await playAndStop(h, lineIn(GATED, "Start here."), ["Wait."]);
      await setPins(h, [pinIn(GATED, "[Show key.]")]);
      await h.select(lineIn(GATED, "Result"));
      await settle(40);

      const { requests } = await pressFoot(h);
      expect(requests.map((r: any) => r.params)).toEqual([
        { add: [pinIn(GATED, "[Wait.]")], remove: [pinIn(GATED, "[Show key.]")] },
      ]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("pinning the run follows its options to the lines an edit above moved them to", async () => {
    const h = await playerOf(GATED, lineIn(GATED, "Result"));
    try {
      await h.compile();
      await h.select(lineIn(GATED, "Result"));
      await settle(40);
      await playAndStop(h, lineIn(GATED, "Start here."), ["Wait."]);
      await insertAtTop(h, "\n\n");
      await h.select(lineIn(GATED, "Result") + 2);
      await settle(40);

      const { requests } = await pressFoot(h);
      const wait = pinIn(GATED, "[Wait.]");
      expect(requests.map((r: any) => r.params)).toEqual([
        { add: [{ ...wait, line: wait.line + 2 }], remove: [] },
      ]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("pins only the run's own choices when PLAY starts at a line no route reaches", async () => {
    const h = await playerOf(UNREACHED, lineIn(UNREACHED, "Shared line."));
    try {
      await h.compile();
      await h.select(lineIn(UNREACHED, "Shared line."));
      await settle(40);
      expect(shown(h).decisions).toEqual([["auto", "Alpha."]]);
      await playAndStop(h, lineIn(UNREACHED, "Jump start."), ["New."]);
      await h.select(lineIn(UNREACHED, "Shared line."));
      await settle(40);

      const { text, requests } = await pressFoot(h);
      expect(text).toBe("Pin the 1 choice from the last run");
      expect(requests.map((r: any) => r.params)).toEqual([
        { add: [pinIn(UNREACHED, "[New.]")], remove: [] },
      ]);
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("pins nothing and says so once a menu the run chose at was edited", async () => {
    const h = await playerOf(GATED, lineIn(GATED, "Result"));
    try {
      await h.compile();
      await h.select(lineIn(GATED, "Result"));
      await settle(40);
      await playAndStop(h, lineIn(GATED, "Start here."), ["Wait."]);
      const line = lineIn(GATED, "[Wait.]");
      const at = GATED.split("\n")[line]!.indexOf("Wait.");
      await h.edit([
        {
          range: {
            start: { line, character: at },
            end: { line, character: at + "Wait.".length },
          },
          text: "Wait here.",
        },
      ]);
      await h.compile();
      await h.select(lineIn(GATED, "Result"));
      await settle(40);

      const { text, requests } = await pressFoot(h);
      expect(text).toBe("Pin the 1 choice from the last run");
      expect(requests).toEqual([]);
      const list = h.controller.refs.routeList as HTMLElement;
      expect(list.querySelector(".route-pin-note")?.textContent).toBe(
        LAST_RUN_CHANGED,
      );
      expect(footButton(h)).toBeUndefined();
    } finally {
      h.dispose();
    }
  }, 120_000);
});
