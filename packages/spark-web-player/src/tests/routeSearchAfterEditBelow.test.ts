import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { lastSearchStats } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "file:///local/main.sd";

const SOURCE = [
  "scene scene_0",
  "= INT. ROOM 0 - DAY",
  "  Action describing room 0.",
  "hero:",
  "  Trust is {trust}.",
  "if trust > 2 then",
  "  hero: I trust you in scene 0.",
  "else",
].join("\n");

const EDITED = SOURCE.replace("if trust", "i1f trust");

const configure = (text: string) => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    seedBuiltinsIntoStory: true,
    files: [
      { uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" },
    ],
  } as never);
  return compiler;
};

const compile = (compiler: SparkdownCompiler) =>
  compiler.compile({ textDocument: { uri: URI } } as never);

const newGame = (program: any) =>
  new Game({
    program,
    now: () => 0,
    setTimeout: ((fn: Function) => {
      fn();
      return 0;
    }) as never,
  } as never);

const search = (game: Game, compiler: SparkdownCompiler) => {
  const log = new RouteSearchLog();
  game.setStartFrom({ file: URI, line: 5 });
  searchRouteTo(game, game.startAddress!, log, {});
  return {
    reachedTarget: log.last?.reachedTarget,
    simulationFailure: log.last?.simulationFailure,
  };
};

describe("a route search after an edit below the resumed checkpoint", () => {
  test("reaches the verdict a fresh game reaches, on every later search too", () => {
    const fresh = configure(EDITED);
    const freshGame = newGame(compile(fresh).program);
    const expected = search(freshGame, fresh);

    const compiler = configure(SOURCE);
    const game = newGame(compile(compiler).program);
    search(game, compiler);
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        { range: { start: { line: 5, character: 1 }, end: { line: 5, character: 1 } }, text: "1" },
      ],
    } as never);
    const edited = compile(compiler);
    expect(edited.program.changes).toBeDefined();
    game.updateProgram(edited.program);

    const searches = watchSearches();
    expect(search(game, compiler)).toEqual(expected);
    expect(search(game, compiler)).toEqual(expected);
    expect(searches.filter((s) => s.endReason === "errored")).toEqual([]);
    expect(searches.filter((s) => s.resumed).length).toBeGreaterThan(0);
  }, 120_000);
});

function watchSearches() {
  const searches: { resumed: boolean; endReason: string }[] = [];
  const planRoute = Game.planRoute.bind(Game);
  vi.spyOn(Game, "planRoute").mockImplementation(((...args: unknown[]) => {
    const budget = args[4] as { resumeFrom?: unknown } | undefined;
    const route = planRoute(...(args as Parameters<typeof Game.planRoute>));
    searches.push({
      resumed: budget?.resumeFrom != null,
      endReason: String(lastSearchStats.endReason),
    });
    return route;
  }) as never);
  return searches;
}

afterEach(() => {
  vi.restoreAllMocks();
});
