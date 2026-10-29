import { SetRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import { describe, expect, it } from "vitest";
import {
  createPlayerHarness,
  MAIN_URI,
  settle,
  writtenText,
} from "./playerHarness";

const SOURCE = `store trust = 0
store clues = 0

scene interrogation
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
  if trust > 3 then
    INSPECTOR:
      I believe you.
    for i = 1, 40000 do
      clues += 1
    end
    You found {clues} clues.
  end
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));
const FOUND = lineOf("You found");
const BELIEVE = lineOf("I believe you");
const TRUTH = lineOf("[Tell the truth.]");

const shown = (h: any) => {
  const game = h.workerState.gameState.game;
  return {
    decisions: (game.previewRoute?.decisions ?? []).map((d: any) => [
      d.kind,
      d.text,
    ]),
    failure: game.simulationFailure,
    trust: game.story.variablesState["trust"],
  };
};

const setPins = async (
  h: any,
  pins: { uri: string; line: number; offer: number }[],
) => {
  await h.controller.handleSetRoutePins(
    SetRoutePinsMessage.type.request({ pins }),
  );
  await settle(40);
};

describe("a pinned route resumed for a line inside the if it forced", () => {
  it("previews the line inside the if after the line past it", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FOUND },
    });
    try {
      await h.compile();
      await h.controller.handleSetRoutePins(
        SetRoutePinsMessage.type.request({
          pins: [{ uri: MAIN_URI, line: TRUTH, offer: 1 }],
        }),
      );
      await settle(40);
      await h.select(FOUND);
      await settle(60);
      expect(shown(h)).toEqual({
        decisions: [
          ["pinned", "Tell the truth."],
          ["forced", "trust > 3"],
          ["clipped", "for i = 1, 40000"],
        ],
        failure: undefined,
        trust: 2,
      });

      await h.select(BELIEVE);
      await settle(60);
      expect(shown(h)).toEqual({
        decisions: [
          ["pinned", "Tell the truth."],
          ["forced", "trust > 3"],
        ],
        failure: undefined,
        trust: 2,
      });
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("previews the line inside the if by the searched route once a pin set before the first preview is cleared", async () => {
    const source = SOURCE.replace(
      "    * [Show the photograph.]\n      trust += 5\n",
      "",
    );
    const line = (text: string) =>
      source.split("\n").findIndex((l) => l.includes(text));
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: source }],
      startFrom: { file: MAIN_URI, line: line("I believe you") },
    });
    try {
      await setPins(h, [{ uri: MAIN_URI, line: line("[Lie.]"), offer: 1 }]);
      await h.compile();
      await h.select(line("I believe you"));
      await settle(60);
      expect(shown(h)).toEqual({
        decisions: [
          ["pinned", "Lie."],
          ["forced", "trust > 3"],
        ],
        failure: undefined,
        trust: -1,
      });

      const sentBefore = h.toRouter.length;
      await setPins(h, []);
      expect(shown(h)).toEqual({
        decisions: [
          ["auto", "Lie."],
          ["forced", "trust > 3"],
        ],
        failure: undefined,
        trust: -1,
      });
      expect(writtenText(h.toRouter.slice(sentBefore))).toContain(
        "I believe you.",
      );
    } finally {
      h.dispose();
    }
  }, 120_000);
});
