// #1658 — PLAY changes no pin, and the route to a line does not depend on
// what was chosen while playing: the line after a menu shows the option it
// showed before PLAY. After a PLAY, the route list's foot offers "Pin the N
// choices from the last run", which pins each menu of the run as played,
// the route's menus before where PLAY started among them, until the next
// PLAY.
import { ChangeRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/ChangeRoutePinsMessage";
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

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));
const pinAt = (text: string, offer = 1) => ({
  uri: MAIN_URI,
  line: lineOf(text),
  offer,
});

/** The route the worker's game reports for the line on screen, as each
 *  choice's kind and text, and the store it holds there. */
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

/** Run PLAY's game on to its next menu and take the option `text`. */
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

describe("PLAY and the pins", () => {
  it("changes no pin and no route, and offers to pin its run as played", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: lineOf("Trust is") },
      manualClock: true,
    });
    const win = h.overlay.ownerDocument.defaultView as any;
    win.requestAnimationFrame ??= (callback: () => void) =>
      setTimeout(callback, 0);
    // The toolbar's route button and list, which the harness leaves out.
    const refs = h.controller.refs;
    refs.routeButton = win.document.createElement("div");
    refs.routeList = win.document.createElement("div");
    refs.leftItems.append(refs.routeButton, refs.locationItems);
    try {
      await h.compile();
      await h.select(lineOf("Trust is"));
      await settle(40);
      const before = shown(h);
      expect(before).toEqual({
        decisions: [
          ["auto", "Knock."],
          ["auto", "Tell the truth."],
        ],
        trust: 2,
      });

      // PLAY from the line before the second menu, whose route took
      // "Knock.", and choose "Lie." and then "Stay.".
      await h.select(lineOf("Where were you at nine?"));
      await settle(40);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(40);
      await choose(h, "Lie.");
      await choose(h, "Stay.");
      await h.controller.stopGame("quit");
      await settle(40);

      expect(changeRequests(h)).toEqual([]);
      await h.select(lineOf("Trust is"));
      await settle(40);
      expect(shown(h)).toEqual(before);

      h.controller.setRouteOpen(true);
      await settle(5);
      const button = footButton(h);
      expect(button?.textContent).toBe("Pin the 3 choices from the last run");
      button!.click();
      const [request] = changeRequests(h);
      expect(request.params).toEqual({
        add: [pinAt("[Knock.]"), pinAt("[Lie.]"), pinAt("[Stay.]")],
        remove: [],
      });
    } finally {
      h.dispose();
    }
  }, 120_000);
});
