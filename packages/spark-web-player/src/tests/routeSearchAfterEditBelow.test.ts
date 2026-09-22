// The workspace worker keeps one game across compiles, and after an edit the
// route search resumes from a checkpoint the previous program's replay took
// before the edited line. That checkpoint has to put the story back where it
// was taken. An edit that grows the scene below it must not move it: a
// checkpoint taken inside the scene's first display call once resumed inside
// a later line's string, still marked as mid-expression, and the engine's
// "Already in expression evaluation?" assert then escaped every search on that
// game (#751). A kept game and a fresh one must reach the same verdict.
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { lastSearchStats } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "file:///local/main.sd";

// The edit turns `if` into `i1f`, so the conditional becomes a line of action
// and the scene gains a whole display call below the line of dialogue.
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
    incrementalCheckpoints: true,
    verifyCheckpoints: false,
  } as never);

const search = (game: Game, compiler: SparkdownCompiler) => {
  const log = new RouteSearchLog();
  game.setStartFrom({ file: URI, line: 0 });
  searchRouteTo(game, game.startPath!, log, { config: compiler.config } as any);
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
    // The incremental compile says what it changed, which is what lets the
    // search resume from the previous program's checkpoints at all.
    expect(edited.program.changes).toBeDefined();
    game.updateProgram(edited.program);

    const searches = watchSearches();
    expect(search(game, compiler)).toEqual(expected);
    expect(search(game, compiler)).toEqual(expected);
    // A resumed search that broke on its first node still ends in the verdict
    // above, because the scene is then searched from the top. It must not
    // break: that is the misplaced checkpoint, whatever the verdict says.
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.filter((s) => s.endReason === "errored")).toEqual([]);
  }, 120_000);
});

/** How each search the planner ran ended, kept without the story it ran on. */
function watchSearches() {
  const searches: { resumed: boolean; endReason: string }[] = [];
  const planRoute = Game.planRoute.bind(Game);
  vi.spyOn(Game, "planRoute").mockImplementation(((...args: unknown[]) => {
    const budget = args[5] as { resumeFrom?: unknown } | undefined;
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
