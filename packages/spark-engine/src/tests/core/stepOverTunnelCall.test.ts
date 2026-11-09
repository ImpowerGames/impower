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
const AFTER_CALL_LINE = 5;
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
  const stops: number[] = [];
  game.connection.outgoing.addListener("game/stepped", (message) => {
    stops.push(
      (message as unknown as { params: { location: { range: { start: { line: number } } } } })
        .params.location.range.start.line,
    );
  });
  game.start();
  return { game, stops };
};

describe("stepping at a tunnel's call line", () => {
  it("passes over the tunnel with Step Over", () => {
    const { game, stops } = play();
    game.step("in");
    expect(stops).toEqual([CALL_LINE]);
    game.step("over");
    expect(stops).toEqual([CALL_LINE, AFTER_CALL_LINE]);
  });

  it("enters the tunnel with Step Into", () => {
    const { game, stops } = play();
    game.step("in");
    game.step("in");
    expect(stops).toEqual([CALL_LINE, FIRST_TUNNEL_LINE]);
  });

  it("keeps Step Over inside the tunnel once it has run a statement there", () => {
    const { game, stops } = play();
    game.step("in");
    game.step("in");
    game.step("over");
    expect(stops).toEqual([CALL_LINE, FIRST_TUNNEL_LINE, FIRST_TUNNEL_LINE + 1]);
  });
});
