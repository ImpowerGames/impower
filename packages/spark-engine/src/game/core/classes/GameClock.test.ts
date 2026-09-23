import { describe, expect, it } from "vitest";
import { compileProgram } from "../../../tests/harness/compileProgram";
import { Game } from "./Game";

/**
 * A game given `requestFrame` ticks on a clock of its own, as PLAY's game does
 * in the player's worker (#682). `now` is the shared clock, in milliseconds,
 * and a clock reads seconds.
 */
describe("a game's own clock", () => {
  const program = compileProgram(["The line.", ""].join("\n"));

  const build = () => {
    let now = 5_000;
    const frames: (() => void)[] = [];
    const game = new Game({
      program,
      now: () => now,
      setTimeout: (handler: Function) => {
        handler();
        return 0;
      },
      requestFrame: (callback: () => void) => {
        frames.push(callback);
        return frames.length;
      },
    } as never);
    const tick = (ms: number) => {
      now += ms;
      for (const frame of frames.splice(0)) frame();
    };
    return { game, frames, tick };
  };

  it("reads the time in seconds", () => {
    const { game, tick } = build();
    game.start();
    expect(game.clock!.startTime).toBe(5);
    tick(250);
    expect(game.clock!.elapsedTime).toBeCloseTo(0.25, 9);
    expect(game.clock!.deltaMS).toBeCloseTo(250, 9);
    game.destroy();
  });

  it("asks for no frame once the game is destroyed", () => {
    const { game, frames, tick } = build();
    game.start();
    tick(20);
    expect(frames.length).toBe(1);
    game.destroy();
    tick(20);
    expect(frames.length).toBe(0);
  });
});
