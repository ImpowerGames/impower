// I-1620: after a compile, the route search may resume from a checkpoint on
// the route it planned before. When that route forced a condition to reach a
// line inside a branch the story skips, its checkpoints stand where the
// story's own run never does, and a search resumed there for a line the run
// reaches would keep the forced beat on screen. That line is searched from
// the top instead.
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteFor } from "../main/workers/searchRouteTo";

const URI = "file:///local/main.sd";

const SOURCE = `scene start
  Before.
  if false then
    Forced one.
    Forced two.
  end
  done
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

describe("a route search after a compile, for a line the story's own run reaches", () => {
  test("does not resume inside a branch an earlier route forced", () => {
    const compiler = new SparkdownCompiler();
    compiler.configure({
      useBuiltinsPrelude: true,
      seedBuiltinsIntoStory: true,
      files: [
        { uri: URI, type: "script", name: "main", ext: "sd", text: SOURCE, version: 1, languageId: "sparkdown" },
      ],
    } as never);
    const compile = () => compiler.compile({ textDocument: { uri: URI } } as never).program as any;

    const game = newGame(compile());
    game.setStartFrom({ file: URI, line: 4 });
    searchRouteFor(game, game.startAddress!, new RouteSearchLog(), {});
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute?.conditions).toEqual([{ selected: true }]);

    game.updateProgram(compile());
    game.setStartFrom({ file: URI, line: 6 });
    // The premise: the compile offers a point inside the forced branch to
    // resume from.
    expect(game.routeResumption("start", game.startAddress!).resumeFrom).toBeDefined();

    searchRouteFor(game, game.startAddress!, new RouteSearchLog(), {});
    expect(game.simulation).toBe("success");
    expect(game.plannedRoute?.conditions).toEqual([{ selected: false }]);
  }, 120_000);
});
