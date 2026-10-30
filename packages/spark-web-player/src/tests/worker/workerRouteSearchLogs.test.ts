import { CompileProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import { describe, expect, it } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { programIdentity } from "../../utils/programIdentity";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  store mood = "calm"
  HERO: I feel {mood}.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const MOOD = lineOf(`store mood = "calm"`);
const FEEL = lineOf("I feel {mood}.");

const text = (overlay: HTMLElement) => (overlay.textContent ?? "").replace(/\s+/g, " ").trim();

const countSearches = (h: any) => {
  const game = h.workerState.gameState.game;
  const searched: string[] = [];
  const routeResumption = game.routeResumption.bind(game);
  game.routeResumption = (from: string, to: string) => {
    searched.push(to);
    return routeResumption(from, to);
  };
  return searched;
};

const TWO_LINES = `-> start

scene start
  store mood = "calm"
  HERO: I feel {mood}.
  HERO: Still {mood}.
end
`;
const lineIn = (source: string, text: string) =>
  source.split("\n").findIndex((l) => l.includes(text));
const TWO_MOOD = lineIn(TWO_LINES, `store mood = "calm"`);
const TWO_FEEL = lineIn(TWO_LINES, "I feel {mood}.");
const STILL = lineIn(TWO_LINES, "Still {mood}.");

describe("route searches for a selection", () => {
  it("searches a moved selection's route once after a compile that threw", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: TWO_LINES }],
      startFrom: { file: MAIN_URI, line: TWO_FEEL },
    });
    try {
      await h.compile();
      await h.select(TWO_FEEL);
      await settle(40);
      expect(text(h.overlay)).toContain("I feel calm.");

      const at = TWO_LINES.split("\n")[TWO_MOOD]!.indexOf("calm");
      await h.edit([
        {
          range: {
            start: { line: TWO_MOOD, character: at },
            end: { line: TWO_MOOD, character: at + "calm".length },
          },
          text: "angry",
        },
      ]);
      const compiler: any = h.workerState.compilerState.compiler;
      const parseIncrementally = compiler.parseIncrementally;
      compiler.parseIncrementally = () => {
        throw new Error("the compile threw");
      };
      try {
        await h.compile();
      } finally {
        compiler.parseIncrementally = parseIncrementally;
      }
      expect(h.workerState.compilerState.compiler.isProgramOutdated()).toBe(false);

      const searched = countSearches(h);
      await h.select(STILL);
      await settle(40);

      expect(searched).toHaveLength(1);
      expect(text(h.overlay)).toContain("Still calm.");
    } finally {
      h.dispose();
    }
  }, 120_000);

  it("searches no route again for a selection of the line the preview stands on", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FEEL },
    });
    try {
      await h.compile();
      await h.select(FEEL);
      await settle(40);
      expect(text(h.overlay)).toContain("I feel calm.");

      const searched = countSearches(h);
      await h.select(FEEL);
      await settle(40);

      expect(searched).toEqual([]);
      expect(text(h.overlay)).toContain("I feel calm.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});

describe("a program the page still shows", () => {
  it("displays the program the page shows from its own route after a newer one compiles", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FEEL },
    });
    try {
      const shown = await h.compile();
      await h.select(FEEL);
      await settle(40);
      expect(text(h.overlay)).toContain("I feel calm.");

      const at = SOURCE.split("\n")[MOOD]!.indexOf("calm");
      await h.edit([
        {
          range: {
            start: { line: MOOD, character: at },
            end: { line: MOOD, character: at + "calm".length },
          },
          text: "angry",
        },
      ]);
      await h.page.sendRequest(CompileProgramMessage.type, {
        textDocument: { uri: MAIN_URI },
        startFrom: { file: MAIN_URI, line: FEEL },
      });

      const { displayed } = await h.link.request(DisplayPreviewMessage.type, {
        program: programIdentity(shown.program)!,
        file: MAIN_URI,
        line: FEEL,
        speculative: false,
      });
      await settle(40);

      expect(displayed).toBe(true);
      expect(text(h.overlay)).toContain("I feel calm.");
      expect(text(h.overlay)).not.toContain("angry");
    } finally {
      h.dispose();
    }
  }, 120_000);
});
