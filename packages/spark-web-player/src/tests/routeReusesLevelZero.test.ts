// A route search from the top keeps what its level zero built, and the next
// search starts there while the edit since left every chunk that level zero
// ran as it was (#1636). A scrub of a line in a skipped branch after a long
// loop then does not run the loop again, and finds the route a search from
// the top finds; an edit to a statement level zero ran makes the next search
// run level zero again.
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  faithfulBudget,
  type LevelZeroStore,
  type LevelZeroWork,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "inmemory:///main.sd";

// Level zero runs both loops and skips the branch; the lines in the branch
// need its verdict forced, after the first loop has run every pass.
const SOURCE = [
  "store flag = false",
  "store total = 0",
  "store tally = 0",
  "",
  "scene start",
  "  Opening beat.",
  "  for i = 1, 1500 do",
  "    if i % 3 == 0 then",
  "      total += 1",
  "    end",
  "  end",
  "  if flag then",
  "    Inside first {total}.",
  "    Inside second {total}.",
  "  end",
  "  for j = 1, 1500 do",
  "    tally += 1",
  "  end",
  "  Closing beat {tally}.",
  "end",
  "",
];

const budget = { ...faithfulBudget };
afterEach(() => {
  Object.assign(faithfulBudget, budget);
  vi.restoreAllMocks();
});

function configure(lines: string[]) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    useBuiltinsPrelude: true,
    seedBuiltinsIntoStory: true,
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text: lines.join("\n"),
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler;
}

function compile(compiler: SparkdownCompiler) {
  const program = compiler.compile({ textDocument: { uri: URI } } as never)
    .program;
  expect(program.chunks, JSON.stringify(program.diagnostics)).toBeTruthy();
  return program;
}

function gameOf(program: unknown) {
  return new Game({
    program,
    now: () => 0,
    setTimeout: ((fn: Function) => {
      fn();
      return 0;
    }) as never,
  } as never);
}

/** `lines` with the line holding `label` replaced by `text`. */
function edited(lines: string[], label: string, text: string) {
  return lines.map((l) => (l.includes(label) ? text : l));
}

/** Replace the line holding `label` in the compiler's document. */
function editLine(compiler: SparkdownCompiler, label: string, text: string) {
  const line = SOURCE.findIndex((l) => l.includes(label));
  compiler.updateDocument({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [
      {
        range: {
          start: { line, character: 0 },
          end: { line, character: SOURCE[line]!.length },
        },
        text,
      },
    ],
  } as never);
}

/** The story steps each route search ran, and whether each resumed. */
function watchSearches() {
  const searches: { steps: number; resumed: boolean }[] = [];
  const planRoute = Game.planRoute.bind(Game);
  vi.spyOn(Game, "planRoute").mockImplementation(((...args: unknown[]) => {
    const story = args[0] as { stepCount: number };
    const options = args[4] as { resumeFrom?: unknown } | undefined;
    const before = story.stepCount;
    const route = planRoute(...(args as Parameters<typeof Game.planRoute>));
    searches.push({
      steps: story.stepCount - before,
      resumed: options?.resumeFrom != null,
    });
    return route;
  }) as never);
  return searches;
}

function scrub(game: Game, lines: string[], label: string) {
  const line = lines.findIndex((l) => l.includes(label));
  game.setStartFrom({ file: URI, line });
  searchRouteTo(game, game.startAddress!, new RouteSearchLog(), {});
  expect(game.simulation).toBe("success");
  const route = game.plannedRoute!;
  return {
    total: game.story.variablesState["total"] as number,
    fallback: route.fallback ?? false,
    decisions: route.decisions,
    addresses: route.steps.map((s) => s.address),
  };
}

/** A search from the top of a game of its own on `program`. */
function fresh(program: unknown, lines: string[], label: string) {
  return scrub(gameOf(program), lines, label);
}

describe("a route search after an earlier one's level zero", () => {
  test("starts from its work after an edit to a line it never ran, and finds the route a search from the top finds", () => {
    const compiler = configure(SOURCE);
    const game = gameOf(compile(compiler));
    expect(scrub(game, SOURCE, "Inside first").total).toBe(500);

    const text = "    Inside second, edited {total}.";
    editLine(compiler, "Inside second", text);
    const program = compile(compiler);
    game.updateProgram(program);
    const searches = watchSearches();
    const after = edited(SOURCE, "Inside second", text);
    const reused = scrub(game, after, "Inside second, edited");
    vi.restoreAllMocks();

    expect(reused).toEqual(fresh(program, after, "Inside second, edited"));
    expect(reused.total).toBe(500);
    // Started where level zero stopped: neither loop ran again, where level
    // zero runs both, every pass.
    expect(searches).toHaveLength(1);
    expect(searches[0]!.resumed).toBe(false);
    expect(searches[0]!.steps).toBeLessThan(3000);
  }, 120_000);

  test("runs level zero again after a statement is added after the last one a run ran", () => {
    // Level zero ran the loop, skipped the branch and ended with the scene.
    // A divert added before the scene's end runs it again, forever: a search
    // from the top spends the budget and falls back, and so must a search
    // after the edit (round 1 review of PR 2267).
    const lines = [
      "store flag = false",
      "store total = 0",
      "",
      "scene start",
      "  for i = 1, 10 do",
      "    total += 1",
      "  end",
      "  if flag then",
      "    First target {total}.",
      "    Second target {total}.",
      "  end",
      "end",
      "",
    ];
    const compiler = configure(lines);
    const game = gameOf(compile(compiler));
    expect(scrub(game, lines, "First target").total).toBe(10);

    const end = lines.lastIndexOf("end");
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line: end, character: 0 },
            end: { line: end, character: 0 },
          },
          text: "  -> start\n",
        },
      ],
    } as never);
    const program = compile(compiler);
    game.updateProgram(program);
    const after = [...lines.slice(0, end), "  -> start", ...lines.slice(end)];
    const searched = scrub(game, after, "Second target");
    expect(searched).toEqual(fresh(program, after, "Second target"));
    expect(searched.fallback).toBe(true);
  }, 120_000);

  test("runs level zero again after a statement is added to an empty body it entered", () => {
    // Level zero entered the empty body of `if true` and ran nothing in it.
    // A divert added there runs the scene again, forever; the compile emits
    // the `if` statement, which level zero ran, again, so its work no longer
    // holds (round 2 review of PR 2267).
    const lines = [
      "store flag = false",
      "store total = 0",
      "",
      "scene start",
      "  for i = 1, 10 do",
      "    total += 1",
      "  end",
      "  if flag then",
      "    First target {total}.",
      "    Second target {total}.",
      "  end",
      "  if true then",
      "  end",
      "end",
      "",
    ];
    const compiler = configure(lines);
    const game = gameOf(compile(compiler));
    expect(scrub(game, lines, "First target").total).toBe(10);

    const body = lines.indexOf("  if true then") + 1;
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line: body, character: 0 },
            end: { line: body, character: 0 },
          },
          text: "    -> start\n",
        },
      ],
    } as never);
    const program = compile(compiler);
    game.updateProgram(program);
    const after = [...lines.slice(0, body), "    -> start", ...lines.slice(body)];
    const searched = scrub(game, after, "Second target");
    expect(searched).toEqual(fresh(program, after, "Second target"));
    expect(searched.fallback).toBe(true);
  }, 120_000);

  test("runs level zero again after an edit to a line it ran", () => {
    const compiler = configure(SOURCE);
    const game = gameOf(compile(compiler));
    scrub(game, SOURCE, "Inside first");

    const text = "  Closing beat, edited {tally}.";
    editLine(compiler, "Closing beat", text);
    const program = compile(compiler);
    game.updateProgram(program);
    const searches = watchSearches();
    const after = edited(SOURCE, "Closing beat", text);
    const searched = scrub(game, after, "Inside second");
    vi.restoreAllMocks();

    expect(searched).toEqual(fresh(program, after, "Inside second"));
    // Each search ran at least the second loop's 1,500 passes again.
    expect(searches.length).toBeGreaterThan(0);
    for (const search of searches) {
      expect(search.steps).toBeGreaterThan(3000);
    }
  }, 120_000);

  test("falls back as a search from the top does when the budget ended level zero", () => {
    // The budget ends level zero inside the first loop, so every search
    // falls back to origin/main's: the work kept says so, and a search that
    // starts from it falls back at once.
    faithfulBudget.steps = 5_000;
    const program = compile(configure(SOURCE));
    const store = keepingStore();
    const kept = gameOf(program);
    const to = (label: string) => {
      kept.setStartFrom({
        file: URI,
        line: SOURCE.findIndex((l) => l.includes(label)),
      });
      return kept.startAddress!;
    };
    const plan = (game: Game, target: number, levelZeroStore?: LevelZeroStore) => {
      const before = game.story.stepCount;
      const route = Game.planRoute(
        game.story,
        game.program,
        game.routeStartOf(target),
        target,
        { levelZeroStore },
      );
      return { route, steps: game.story.stepCount - before };
    };
    const first = plan(kept, to("Inside first"), store);
    expect(first.route?.fallback).toBe(true);
    expect(store.works.size).toBe(1);
    expect([...store.works.values()][0]!.cut).toBe("max-steps");

    const second = plan(kept, to("Inside second"), store);
    const other = gameOf(program);
    const alone = plan(other, to("Inside second"));
    expect(second.route).toEqual(alone.route);
    expect(second.route?.fallback).toBe(true);
    // The search that started from the work ran none of the 5,000 steps the
    // search that follows the program spends before it falls back.
    expect(second.steps).toBeLessThan(alone.steps - 4_000);
  }, 120_000);
});

/** A store that keeps every work by key, as a game keeps its own. */
function keepingStore() {
  const works = new Map<string, LevelZeroWork>();
  return {
    works,
    find: (key: string) => works.get(key),
    keep: (work: LevelZeroWork) => {
      works.set(work.key, work);
    },
  };
}
