import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { describe, expect, test } from "vitest";
import { compile, createDOMHarness, flushMicrotasks } from "./domTestHarness";

const MAIN_URI = "inmemory:///main.sd";

const FILLER = Array.from(
  { length: 20 },
  (_, i) => `  HERO:\n    Filler line ${i}.\n`,
).join("\n");

const SOURCE = `define SPRITE as image with
  src = "https://example.com/hero.png"
end

-> start

scene start
${FILLER}
  HERO:
    [[SPRITE]]
    (quietly)
    The line being previewed.
end
`;

const TARGET_LINE = SOURCE.split("\n").findIndex((l) =>
  l.includes("The line being previewed."),
);

function routeCheckpoint(): string {
  const game = new Game({
    program: compile(SOURCE) as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...args: any[]) => {
      fn(...args);
      return 0;
    }) as any,
  } as any);
  game.setStartFrom({ file: MAIN_URI, line: TARGET_LINE });
  game.simulate();
  expect(game.simulation).toBe("success");
  return game.save() as string;
}

describe("a checkpoint saved during a simulated route", () => {
  test(
    "displays the layout, portrait and dialogue in a fresh game",
    async () => {
      const h = createDOMHarness(SOURCE, TARGET_LINE, {
        loadCheckpoint: routeCheckpoint(),
      });
      await h.ready;
      await h.preview(TARGET_LINE);
      await flushMicrotasks(10);

      const main = h.overlay.querySelector(".main");
      expect(main).toBeTruthy();
      const portrait = h.overlay.querySelector(".portrait") as HTMLElement;
      expect(portrait.innerHTML).toContain("hero.png");
      expect(h.overlay.querySelector(".dialogue")?.textContent).toContain(
        "The line being previewed.",
      );
      expect(
        h.overlay.querySelector(".character_name")?.textContent,
      ).toContain("HERO");
      expect(h.snapshotDOM()).toMatchSnapshot();
    },
    60_000,
  );
});
