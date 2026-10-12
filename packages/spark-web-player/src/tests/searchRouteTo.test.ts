// The route a preview replays to reach the author's line records the choices
// it took, and the next route to the same scene favors them, so a preview
// keeps showing the branch the author has been looking at. A route replayed
// for an autocomplete suggestion (#634) is replayed in a program the author
// has not written, so nothing it takes may be kept: the real program's next
// route, and PLAY, must go exactly where they would have gone without it.
//
// The game is built from the compiled program, as the player's worker builds
// both its preview game and PLAY's.
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "inmemory:///main.sd";

const SOURCE = [
  "Pick a path.",
  "choose",
  "  * Left path",
  "    You went left.",
  "  * Right path",
  "    You went right.",
  "end",
  "Done here.",
  "",
].join("\n");

function routeToLeft() {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: SOURCE, version: 1, languageId: "sparkdown" },
    ],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const game = new Game({
    program,
    now: () => 0,
    setTimeout: ((fn: Function) => {
      fn();
      return 0;
    }) as never,
  } as never);
  game.setStartFrom({ file: URI, line: SOURCE.split("\n").indexOf("    You went left.") });
  expect(game.startAddress).toBeTruthy();
  return { game, to: game.startAddress! };
}

describe("a route search", () => {
  test("for the real program remembers the choices its route took", () => {
    const { game, to } = routeToLeft();
    const config: { simulationOptions?: Record<string, any> } = {};
    const log = new RouteSearchLog();

    const checkpoint = searchRouteTo(game, to, log, { config });

    expect(checkpoint).toBeTruthy();
    expect(log.last).toMatchObject({ address: to, reachedTarget: true });
    const favored = Object.values(config.simulationOptions ?? {});
    expect(favored).toHaveLength(1);
    expect(favored[0].favoredChoices).toHaveLength(1);
  });

  test("for a suggestion remembers nothing, and still answers", () => {
    const { game, to } = routeToLeft();
    const config: { simulationOptions?: Record<string, any> } = {};
    const real = new RouteSearchLog();
    const suggestion = new RouteSearchLog();

    const checkpoint = searchRouteTo(game, to, suggestion, {
      config,
      remember: false,
    });

    expect(checkpoint).toBeTruthy();
    expect(suggestion.last).toMatchObject({ address: to, reachedTarget: true });
    expect(config.simulationOptions).toBeUndefined();
    expect(real.last).toBeNull();
  });
});
