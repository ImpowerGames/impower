import { describe, expect, it } from "vitest";
import { Game } from "../../game/core/classes/Game";
import { compileProgram } from "../harness/compileProgram";

const MENU = [
  "scene start",
  "  Hello.",
  "  choose",
  "  + [Stay]",
  "    Stayed.",
  "  + [Leave]",
  "    Left.",
  "  end",
  "  Bye.",
  "end",
  "",
].join("\n");

const play = () => {
  const game = new Game({
    program: compileProgram(MENU),
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);
  const waits: unknown[] = [];
  game.connection.outgoing.addListener("game/awaitingInteraction", (message) => {
    waits.push((message as unknown as { params: { choices?: boolean } }).params.choices);
  });
  return { game, waits };
};

describe("the engine's wait for interaction", () => {
  it("says whether the beat it waits on is a choice menu", () => {
    const { game, waits } = play();
    game.start();
    expect(waits).toEqual([false]);
    game.clickedToContinue();
    expect(waits).toEqual([false, true]);
    game.chosePathToContinue(0);
    expect(waits).toEqual([false, true, false]);
  });
});
