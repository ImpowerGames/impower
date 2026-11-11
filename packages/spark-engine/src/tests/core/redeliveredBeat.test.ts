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
  const settling = vi.spyOn(Coordinator.prototype, "onSettle");
  const typing = vi.spyOn(Coordinator.prototype, "onExecute");
  const drawn = () => {
    const coordinator = (game as any)._coordinator;
    const text = Object.values((game as any)._shownBeatOnScreen?.text ?? {})
      .flat()
      .map((t: any) => t.text)
      .filter((t: string) => t !== "HERO")
      .join("")
      .trim();
    return {
      text,
      drawing: settling.mock.contexts.includes(coordinator)
        ? "settled"
        : typing.mock.contexts.includes(coordinator)
          ? "typed"
          : "none",
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

  it("draws its first beat settled when it is the beat on screen, and types the next", () => {
    const first = run();
    first.game.start();
    const onScreen = (first.game as any)._shownBeatOnScreen as Instructions;
    expect(first.drawn()).toEqual({ text: "The first line.", drawing: "typed" });
    vi.restoreAllMocks();

    const again = run(onScreen);
    again.game.start();
    expect(again.drawn()).toEqual({ text: "The first line.", drawing: "settled" });
    again.game.clickedToContinue();
    expect(again.drawn()).toEqual({ text: "The second line.", drawing: "typed" });
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
    expect(again.drawn()).toEqual({ text: "The first line.", drawing: "typed" });
  });
});
