// A preview after a route origin/main's search found (#637).
//
// The search that follows the program runs within a budget, and a line it
// cannot reach within it is reached by origin/main's search, whose route is
// marked a fallback. A scrub that resumes from a fallback route resumes it as
// origin/main's preview does, by origin/main's search alone, so it shows the
// value origin/main's preview shows for the same scrubs. A scrub that cannot
// resume from it searches from the top, which follows the program wherever
// its budget allows. The budget is lowered here so that scripts small enough
// to run fall back.
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { faithfulBudget } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { afterEach, describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import { searchRouteTo } from "../main/workers/searchRouteTo";

const URI = "inmemory:///main.sd";

const TEXT = [
  "store total = 0",
  "",
  "scene start",
  "  Opening beat.",
  "  for i = 1, 3 do",
  "    total += i",
  "  end",
  "  Middle beat.",
  "  if total < 0 then",
  "    Skipped line {total}.",
  "  end",
  "  Target total {total}.",
  "end",
  "",
].join("\n");

const budget = { ...faithfulBudget };
afterEach(() => {
  Object.assign(faithfulBudget, budget);
});

function configure(text: string) {
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
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler;
}

function compile(compiler: SparkdownCompiler) {
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
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

function target(game: Game, text: string, label: string) {
  const line = text.split("\n").findIndex((l) => l.includes(label));
  expect(line).toBeGreaterThanOrEqual(0);
  game.setStartFrom({ file: URI, line });
  return game.startAddress!;
}

/** Preview the line holding `label` and return the value of `total` it
 *  shows. */
function scrub(game: Game, text: string, label: string) {
  searchRouteTo(game, target(game, text, label), new RouteSearchLog(), {});
  expect(game.simulation).toBe("success");
  return game.story.variablesState["total"] as number;
}

/** Recompile the program unchanged and hand it to `game`, as an edit
 *  elsewhere does, so that the next scrub may resume from its route. */
function recompile(game: Game, compiler: SparkdownCompiler) {
  const program = compile(compiler);
  expect(program.changes).toBeDefined();
  game.updateProgram(program);
}

/** Scrub the line holding `first`, then, after a recompile, the line holding
 *  `second`, and return what each showed and whether the second resumed. */
function scrubTwice(first: string, second: string) {
  const compiler = configure(TEXT);
  const game = gameOf(compile(compiler));
  const before = scrub(game, TEXT, first);
  const firstFellBack = game.plannedRoute?.fallback === true;
  recompile(game, compiler);
  const to = target(game, TEXT, second);
  const resumption = game.routeResumption(game.routeStartOf(to), to);
  const after = scrub(game, TEXT, second);
  return {
    before,
    firstFellBack,
    resumed: resumption.resumeFrom != null,
    charged: resumption.resumeFrom?.charge != null,
    after,
    secondFellBack: game.plannedRoute?.fallback === true,
  };
}

function scrubFresh(label: string) {
  const game = gameOf(compile(configure(TEXT)));
  const value = scrub(game, TEXT, label);
  return { value, fellBack: game.plannedRoute?.fallback === true };
}

describe("a scrub after a route origin/main's search found", () => {
  test("resumes by origin/main's search and shows the value origin/main's preview shows", () => {
    // Every search falls back: origin/main's preview of the same two scrubs.
    faithfulBudget.nodes = 0;
    const main = scrubTwice("Skipped line", "Target total");
    expect(main).toMatchObject({ before: 0, firstFellBack: true, after: 0 });

    // The skipped line needs more than this budget; the target does not.
    faithfulBudget.nodes = 4;
    const resumed = scrubTwice("Skipped line", "Target total");
    expect(resumed).toEqual({
      before: 0,
      firstFellBack: true,
      resumed: true,
      charged: false,
      after: main.after,
      secondFellBack: true,
    });
    // Searched from the top, the target is reached by the program's own way.
    expect(scrubFresh("Target total")).toEqual({ value: 6, fellBack: false });
  }, 120_000);

  test("replays its route again for the same line", () => {
    faithfulBudget.nodes = 4;
    expect(scrubTwice("Skipped line", "Skipped line")).toMatchObject({
      before: 0,
      resumed: true,
      after: 0,
      secondFellBack: true,
    });
  }, 120_000);

  test("searches from the top when an edit comes before every checkpoint of the route", () => {
    faithfulBudget.nodes = 4;
    const compiler = configure(TEXT);
    const game = gameOf(compile(compiler));
    expect(scrub(game, TEXT, "Skipped line")).toBe(0);
    expect(game.plannedRoute?.fallback).toBe(true);
    const line = TEXT.split("\n").findIndex((l) => l.includes("Opening beat"));
    compiler.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line, character: 2 },
            end: { line, character: 2 },
          },
          text: "The ",
        },
      ],
    } as never);
    const edited = compiler.compile({ textDocument: { uri: URI } }).program;
    expect(edited.changes).toBeDefined();
    game.updateProgram(edited);
    const text = TEXT.replace("  Opening beat.", "  The Opening beat.");
    const to = target(game, text, "Target total");
    // The premise: nothing of the route is left to resume from.
    expect(game.routeResumption(game.routeStartOf(to), to).resumeFrom).toBe(
      undefined,
    );
    expect(scrub(game, text, "Target total")).toBe(6);
    expect(game.plannedRoute?.fallback).toBeUndefined();
  }, 120_000);
});

describe("a scrub resumed from a route the program's own search found", () => {
  // Nine nodes reach the skipped line by the program's own way; eight do
  // not.
  test.each([
    [9, 6, false],
    [8, 0, true],
  ])(
    "at a budget of %i nodes shows what a search from the top shows",
    (nodes, value, fellBack) => {
      faithfulBudget.nodes = nodes;
      expect(scrubFresh("Skipped line")).toEqual({ value, fellBack });
      const resumed = scrubTwice("Target total", "Skipped line");
      expect(resumed).toMatchObject({
        before: 6,
        firstFellBack: false,
        resumed: true,
        after: value,
        secondFellBack: fellBack,
      });
    },
    120_000,
  );
});
