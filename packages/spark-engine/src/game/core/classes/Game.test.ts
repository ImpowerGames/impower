import { describe, expect, it } from "vitest";
import { compileProgram } from "../../../tests/harness/compileProgram";
import { Game } from "./Game";

const createGame = () =>
  new Game({
    program: compileProgram("A beat.\n"),
  } as never);

describe("Game debugging", () => {
  it("turns the flag on", () => {
    const game = createGame();
    game.startDebugging();
    expect(game.context.system.debugging).toBe(true);
  });

  it("turns the flag back off", () => {
    const game = createGame();
    game.startDebugging();
    game.stopDebugging();
    expect(game.context.system.debugging).toBe(false);
  });
});
