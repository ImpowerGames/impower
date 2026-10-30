import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { planRoute } from "@impower/sparkdown/src/compiler/utils/planRoute";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";

const URI = "inmemory:///main.sd";

const NO_SUCH_ADDRESS: ProgramAddress = 2 ** 40;

const SRC = `store score = 0



scene start
  First line here.
  & score = 10
  Second line here.
  & score = 20
  Third line here.
end
`;
const TARGET_LINE = 9;

function compileSrc(src: string) {
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
        text: src,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri: URI } });
  return requireChunks(result.program, "route-reset fixture");
}

function newGame(program: unknown) {
  return new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);
}

function countGlobalEvaluations(game: Game): () => number {
  const story = game.story as any;
  const method = "runDeclarations";
  let count = 0;
  const original = story[method].bind(story);
  story[method] = (...args: unknown[]) => {
    count += 1;
    return original(...args);
  };
  return () => count;
}

function planTo(game: Game, program: any, line: number) {
  game.setStartFrom({ file: URI, line });
  const toPath = game.startAddress!;
  const fromPath = game.routeStartOf(toPath);
  return Game.planRoute(game.story, program, fromPath, toPath, {
    callerResetsStory: true,
  });
}

describe("route search resets (#650)", () => {
  test("a search and its replay evaluate the globals once", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    const evaluations = countGlobalEvaluations(game);

    const route = planTo(game, program, TARGET_LINE);
    expect(route).not.toBeNull();
    game.patchAndSimulateRoute(route!);

    expect(game.simulation).toBe("success");
    expect(evaluations()).toBe(1);
  });

  test("a search on a story that has been advanced evaluates the globals", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    game.story.ChoosePathString("start");
    game.story.Continue();

    const evaluations = countGlobalEvaluations(game);
    const route = planTo(game, program, TARGET_LINE);

    expect(route).not.toBeNull();
    expect(evaluations()).toBeGreaterThanOrEqual(1);
  });

  test("a search after a global is written from outside evaluates the globals", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    (game.story.variablesState as any)["score"] = 999;
    expect((game.story.variablesState as any).$("score")).toBe(999);

    const evaluations = countGlobalEvaluations(game);
    const route = planTo(game, program, TARGET_LINE);

    expect(route).not.toBeNull();
    expect(evaluations()).toBeGreaterThanOrEqual(1);
  });

  test("a global written from outside leaves the story not pristine on the program engine (#1692)", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    expect(game.story.stateIsPristine).toBe(true);

    (game.story.variablesState as any)["score"] = 999;

    expect(game.story.stateIsPristine).toBe(false);
  });

  test("a found route leaves a story the caller can reset straight away", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);

    const route = planTo(game, program, TARGET_LINE);
    expect(route).not.toBeNull();

    expect(() => game.story.ResetState()).not.toThrow();
  });

  test("a search that finds no route leaves the story reset", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    game.story.ChoosePathString("start");
    game.story.Continue();

    const route = planRoute(game.story, "start", NO_SUCH_ADDRESS, {
      callerResetsStory: true,
    });

    expect(route).toBeNull();
    expect(
      (game.story.state as any)
        .GetVisitCountEntries()
        .find(([key]: [string, number]) => key === "start")?.[1] ?? 0,
    ).toBe(0);
    expect(game.story.canContinue).toBe(true);
  });

  test("a search that throws leaves the story usable", () => {
    const program = compileSrc(SRC);
    const game = newGame(program);
    const story = game.story as any;
    const hookBefore = story.onExecute;
    const originalChoosePathString = story.ChoosePathString.bind(story);
    let thrown = false;
    story.ChoosePathString = () => {
      thrown = true;
      story.ChoosePathString = originalChoosePathString;
      throw new Error("planted failure inside the search");
    };

    expect(() =>
      planRoute(game.story, "start", NO_SUCH_ADDRESS, {
        callerResetsStory: true,
      }),
    ).toThrow("planted failure inside the search");
    expect(thrown).toBe(true);

    expect(story.onExecute).toBe(hookBefore);
    game.story.ChoosePathString("start");
    expect(game.story.Continue()?.trim()).toBe("First line here.");
  });
});
