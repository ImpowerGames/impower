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
  test("records its route in the log it is given", () => {
    const { game, to } = routeToLeft();
    const log = new RouteSearchLog();

    const checkpoint = searchRouteTo(game, to, log, {});

    expect(checkpoint).toBeTruthy();
    expect(log.last).toMatchObject({ address: to, reachedTarget: true });
  });

  test("for a suggestion records nothing in the real program's log, and still answers", () => {
    const { game, to } = routeToLeft();
    const real = new RouteSearchLog();
    const suggestion = new RouteSearchLog();

    const checkpoint = searchRouteTo(game, to, suggestion, {});

    expect(checkpoint).toBeTruthy();
    expect(suggestion.last).toMatchObject({ address: to, reachedTarget: true });
    expect(real.last).toBeNull();
  });
});
