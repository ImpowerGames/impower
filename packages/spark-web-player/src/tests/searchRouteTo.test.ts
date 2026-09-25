// The route a preview replays to reach the author's line records the choices
// it took, and the next route to the same scene favors them, so a preview
// keeps showing the branch the author has been looking at. A route replayed
// for an autocomplete suggestion (#634) is replayed in a program the author
// has not written, so nothing it takes may be kept: the real program's next
// route, and PLAY, must go exactly where they would have gone without it.
//
// Both shapes of game are covered: one built over the compiler's own story
// with nothing emitted, as the player's worker routes for the preview, and
// one built from the compiled bytecode, as PLAY's game is.
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

function routeToLeft(overStory: boolean) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text: SOURCE, version: 1, languageId: "sparkdown" },
    ],
    emitCompiledProgram: !overStory,
  } as never);
  let story: unknown;
  compiler.addEventListener("compiler/didCompile", (params) => {
    story = params.story;
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const game = new Game({
    program,
    story: overStory ? story : undefined,
    now: () => 0,
    setTimeout: ((fn: Function) => {
      fn();
      return 0;
    }) as never,
    incrementalCheckpoints: true,
    verifyCheckpoints: false,
  } as never);
  game.setStartFrom({ file: URI, line: SOURCE.split("\n").indexOf("    You went left.") });
  expect(game.startPath).toBeTruthy();
  return { game, toPath: game.startPath! };
}

for (const overStory of [false, true]) {
  describe(`a route search (${overStory ? "over the compiler's story" : "over the compiled bytecode"})`, () => {
    test("for the real program remembers the choices its route took", () => {
      const { game, toPath } = routeToLeft(overStory);
      const config: { simulationOptions?: Record<string, any> } = {};
      const log = new RouteSearchLog();

      const checkpoint = searchRouteTo(game, toPath, log, { config });

      expect(checkpoint).toBeTruthy();
      expect(log.last).toMatchObject({ path: toPath, reachedTarget: true });
      const favored = Object.values(config.simulationOptions ?? {});
      expect(favored).toHaveLength(1);
      expect(favored[0].favoredChoices).toHaveLength(1);
    });

    test("for a suggestion remembers nothing, and still answers", () => {
      const { game, toPath } = routeToLeft(overStory);
      const config: { simulationOptions?: Record<string, any> } = {};
      const real = new RouteSearchLog();
      const suggestion = new RouteSearchLog();

      const checkpoint = searchRouteTo(game, toPath, suggestion, {
        config,
        remember: false,
      });

      expect(checkpoint).toBeTruthy();
      expect(suggestion.last).toMatchObject({ path: toPath, reachedTarget: true });
      expect(config.simulationOptions).toBeUndefined();
      expect(real.last).toBeNull();
    });
  });
}
