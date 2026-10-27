// I-1620: the route to a line past a choice is the story's own run through
// the choice the player makes, on the first scrub and on every later one.
// A later search favors the choices the route before it took; it must not
// change the route a scrub of the same line gets.
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteFor } from "../main/workers/searchRouteTo";

const URI = "file:///local/main.sd";

// The `done` is line 9, counting from zero.
const SOURCE = `scene start
  choose
    * [Continue]
      Before.
      if true then
        if true then
          Natural.
        end
      end
      done
  end
end
`;

const newGame = (program: any) =>
  new Game({
    program,
    now: () => 0,
    setTimeout: ((fn: Function) => {
      fn();
      return 0;
    }) as never,
  } as never);

describe("a line past a choice nothing favors", () => {
  test("gets the story's own run on every scrub", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      files: [
        { uri: URI, type: "script", name: "main", ext: "sd", text: SOURCE, version: 1, languageId: "sparkdown" },
      ],
    } as never);
    const game = newGame(compiler.compile({ textDocument: { uri: URI } } as never).program);
    const config = {};
    const scrub = (line: number) => {
      game.setStartFrom({ file: URI, line });
      searchRouteFor(game, game.startAddress!, new RouteSearchLog(), { config });
      expect(game.simulation).toBe("success");
      return {
        conditions: game.plannedRoute?.conditions,
        choices: game.plannedRoute?.choices.map((c) => c.selected),
      };
    };

    const first = scrub(9);
    expect(first.conditions).toEqual([{ selected: true }, { selected: true }]);
    // Another line between, as an author scrubs.
    scrub(3);
    expect(scrub(9)).toEqual(first);
  }, 120_000);
});
