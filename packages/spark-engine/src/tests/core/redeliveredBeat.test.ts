import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { Game } from "../../game/core/classes/Game";
import type { Instructions } from "../../game/core/types/Instructions";
import { compileProgram } from "../harness/compileProgram";

const SCRIPT = [
  "scene start",
  "  HERO:",
  "    The first line.",
  "",
  "  HERO:",
  "    The second line.",
  "end",
  "",
].join("\n");

let program: ReturnType<typeof compileProgram>;

const run = (redelivers?: Instructions) => {
  const game = new Game({
    program,
    redelivers,
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);
  const playing = vi.spyOn(Coordinator.prototype, "onExecute");
  const drawn = () => {
    const coordinator = (game as any)._coordinator;
    const onScreen = (game as any)._shownBeatOnScreen as Instructions | undefined;
    const text = Object.values(onScreen?.text ?? {})
      .flat()
      .map((t: any) => t.text)
      .filter((t: string) => t !== "HERO")
      .join("")
      .trim();
    const drawnBeat = coordinator?._instructions as Instructions | undefined;
    const allShown =
      drawnBeat?.end === 0 &&
      Object.values(drawnBeat?.text ?? {})
        .flat()
        .every((event) => event.after === 0 && event.over === 0);
    return {
      text,
      drawing: !playing.mock.contexts.includes(coordinator)
        ? "none"
        : allShown
          ? "shown"
          : "typed",
    };
  };
  return { game, drawn };
};

describe("a run that redelivers the beat on screen (#2031)", () => {
  beforeAll(() => {
    program = compileProgram(SCRIPT);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws its first beat with its text shown when it reads as the beat on screen, and types the next", () => {
    const first = run();
    first.game.start();
    const onScreen = (first.game as any)._shownBeatOnScreen as Instructions;
    expect(first.drawn()).toMatchObject({ text: "The first line.", drawing: "typed" });
    vi.restoreAllMocks();

    const again = run(onScreen);
    again.game.start();
    expect(again.drawn()).toEqual({ text: "The first line.", drawing: "shown" });
    expect((again.game as any)._shownBeatOnScreen).toEqual(onScreen);
    again.game.clickedToContinue();
    expect(again.drawn()).toMatchObject({ text: "The second line.", drawing: "typed" });
  });

  it("types its first beat when the beat on screen was another", () => {
    const first = run();
    first.game.start();
    first.game.clickedToContinue();
    const onScreen = (first.game as any)._shownBeatOnScreen as Instructions;
    expect(first.drawn().text).toBe("The second line.");
    vi.restoreAllMocks();

    const again = run(onScreen);
    again.game.start();
    expect(again.drawn()).toMatchObject({ text: "The first line.", drawing: "typed" });
  });
});
