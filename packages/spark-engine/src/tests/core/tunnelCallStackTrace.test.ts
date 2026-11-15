import { describe, expect, it } from "vitest";
import { Game } from "../../game/core/classes/Game";
import { compileProgram } from "../harness/compileProgram";

const TUNNEL = [
  "store visits = 0",
  "",
  "scene main",
  "  Main here.",
  "  -> sub ->",
  "  Back in main {visits}.",
  "  done",
  "end",
  "scene sub",
  "  visits = visits + 1",
  "  visits = visits + 2",
  "  ->->",
  "end",
  "scene start",
  "  -> main",
  "end",
  "",
].join("\n");

const CALL_LINE = 4;
const FIRST_TUNNEL_LINE = 9;

const play = () => {
  const game = new Game({
    program: compileProgram(TUNNEL),
    now: () => 0,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);
  game.start();
  return game;
};

const frames = (game: Game, startFrame?: number, levels?: number) => {
  const trace = game.getStackTrace(0, startFrame, levels);
  return {
    totalFrames: trace.totalFrames,
    frames: trace.stackFrames.map((f) => [
      f.name,
      (f.location as unknown as { range: { start: { line: number } } }).range.start.line,
    ]),
  };
};

describe("the stack trace at a tunnel's call line", () => {
  it("lists only the caller's frame before the tunnel has run", () => {
    const game = play();
    game.step("in");
    expect(frames(game)).toEqual({
      totalFrames: 1,
      frames: [["main", CALL_LINE]],
    });
  });

  it("lists the tunnel above its caller once Step Into has entered it", () => {
    const game = play();
    game.step("in");
    game.step("in");
    expect(frames(game)).toEqual({
      totalFrames: 2,
      frames: [
        ["sub", FIRST_TUNNEL_LINE],
        ["main", CALL_LINE],
      ],
    });
  });

  it("pages the caller-only stack from its top frame", () => {
    const game = play();
    game.step("in");
    expect(frames(game, 0, 1)).toEqual({
      totalFrames: 1,
      frames: [["main", CALL_LINE]],
    });
    expect(frames(game, 1)).toEqual({ totalFrames: 1, frames: [] });
  });
});
