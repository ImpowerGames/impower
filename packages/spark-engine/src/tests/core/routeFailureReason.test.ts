import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  lastSearchStats,
  planRoute,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";
import {
  TOP_LEVEL_START,
  type ProgramAddress,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";

const URI = "inmemory:///main.sd";

const NO_SUCH_ADDRESS: ProgramAddress = 2 ** 40;

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
  } as never);
  const result = compiler.compile({ textDocument: { uri: URI } });
  return requireChunks(result.program);
}

const newGame = (program: unknown) =>
  new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

const UNREACHABLE_TAIL = `scene start
  First beat.
  -> other
  Nothing ever reaches this line.
end

scene other
  Elsewhere.
end
`;

const NO_STORY_FLOW = `define config with
  value = 1
end
`;

const SCENE_THEN_DEFINE = `scene start
  First beat of the scene.
end

define config with
  value = 1
end
`;

const ENDLESS_LOOP = `scene start
  Going round.
  -> start
end
`;

function plainScene(beats: number): string {
  const lines = ["scene start"];
  for (let i = 0; i < beats; i += 1) {
    lines.push(`  Beat number ${i}.`);
  }
  lines.push("end", "");
  return lines.join("\n");
}

function startAddressForLine(program: unknown, line: number): ProgramAddress {
  const game: any = newGame(program);
  game.setStartFrom({ file: URI, line });
  return game.startAddress!;
}

describe("the planner says how its search ended", () => {
  test("a search that reaches the target reports that it found it", () => {
    const program = compileSrc(plainScene(40));
    const toPath = startAddressForLine(program, 38);
    const route = Game.planRoute(newGame(program).story, program, "start", toPath);
    expect(route).not.toBeNull();
    expect(lastSearchStats.endReason).toBe("found");
    expect(lastSearchStats.exhaustedBudget).toBe(false);
  }, 120_000);

  test("a search that runs the story out reports that it was exhausted", () => {
    const program = compileSrc(UNREACHABLE_TAIL);
    const toPath = startAddressForLine(program, 3);
    expect(programLocator(program).locationOf(toPath)).toBeDefined();
    const route = Game.planRoute(newGame(program).story, program, "start", toPath);
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("exhausted");
    expect(lastSearchStats.exhaustedBudget).toBe(false);
  }, 120_000);

  test("a search stopped by a ceiling names the ceiling that stopped it", () => {
    const program = compileSrc(ENDLESS_LOOP);
    const route = planRoute(
      newGame(program).story,
      "start",
      NO_SUCH_ADDRESS,
      {
        stayWithinKnot: true,
        maxSteps: 5_000,
        maxNodes: 500,
        searchTimeout: Number.MAX_SAFE_INTEGER,
      },
    );
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("max-steps");
    expect(lastSearchStats.exhaustedBudget).toBe(true);
  }, 120_000);

  test("the wall-clock backstop is reported apart from the work ceilings", () => {
    const program = compileSrc(ENDLESS_LOOP);
    const route = planRoute(
      newGame(program).story,
      "start",
      NO_SUCH_ADDRESS,
      {
        stayWithinKnot: true,
        maxSteps: Number.MAX_SAFE_INTEGER,
        maxNodes: Number.MAX_SAFE_INTEGER,
        searchTimeout: 50,
      },
    );
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("timeout");
    expect(lastSearchStats.exhaustedBudget).toBe(true);
  }, 120_000);
});

describe("a search that broke does not claim to have looked everywhere", () => {
  const makeThrowingSearch = () => {
    const program = compileSrc(plainScene(10));
    const toPath = startAddressForLine(program, 8);
    const game: any = newGame(program);
    const story = game.story;
    story.ContinueAsync = () => {
      throw new Error("simulated internal engine fault");
    };
    return { program, story, toPath };
  };

  test("a search whose every node throws is reported as errored, not exhausted", () => {
    const { story, toPath } = makeThrowingSearch();
    const route = planRoute(story, "start", toPath, {
      stayWithinKnot: true,
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("errored");
    expect(lastSearchStats.exhaustedBudget).toBe(false);
  }, 120_000);

  test("and the author is not told their script has no path", () => {
    const { program, story, toPath } = makeThrowingSearch();
    planRoute(story, "start", toPath, {
      stayWithinKnot: true,
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    expect(newGame(program).describeFailedRouteSearch(toPath)).toBe("errored");
    expect(newGame(program).describeFailedRouteSearch(toPath)).not.toBe(
      "exhausted",
    );
  }, 120_000);

  test("an intact search over the same fixture still reports exhausted", () => {
    const program = compileSrc(UNREACHABLE_TAIL);
    const toPath = startAddressForLine(program, 3);
    planRoute(newGame(program).story, "start", toPath, {
      stayWithinKnot: true,
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    expect(lastSearchStats.endReason).toBe("exhausted");
  }, 120_000);
});

describe("the planner's verdict becomes the reason shown to the author", () => {
  test("a ceiling of any kind is reported as having run out of time", () => {
    const program = compileSrc(ENDLESS_LOOP);
    planRoute(newGame(program).story, "start", NO_SUCH_ADDRESS, {
      stayWithinKnot: true,
      maxSteps: 5_000,
      maxNodes: 500,
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    expect(lastSearchStats.endReason).toBe("max-steps");
    const realTarget = startAddressForLine(program, 1);
    expect(newGame(program).describeFailedRouteSearch(realTarget)).toBe("timeout");
  }, 120_000);

  test("a target that is not in the story is unroutable, whatever ended the search", () => {
    const program = compileSrc(ENDLESS_LOOP);
    planRoute(newGame(program).story, "start", NO_SUCH_ADDRESS, {
      stayWithinKnot: true,
      maxSteps: 5_000,
      maxNodes: 500,
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    expect(lastSearchStats.endReason).toBe("max-steps");
    expect(newGame(program).describeFailedRouteSearch(NO_SUCH_ADDRESS)).toBe(
      "unroutable",
    );
    expect(newGame(program).describeFailedRouteSearch(null)).toBe("unroutable");
    expect(newGame(program).describeFailedRouteSearch(TOP_LEVEL_START)).toBe(
      "unroutable",
    );
  }, 120_000);

  test("an exhausted search is reported as exhausted", () => {
    const program = compileSrc(UNREACHABLE_TAIL);
    const toPath = startAddressForLine(program, 3);
    Game.planRoute(newGame(program).story, program, "start", toPath);
    expect(newGame(program).describeFailedRouteSearch(toPath)).toBe("exhausted");
  }, 120_000);
});

describe("a game that simulates for itself records the same reason", () => {
  test("a line no route reaches is recorded as exhausted", () => {
    const program = compileSrc(UNREACHABLE_TAIL);
    const game: any = newGame(program);
    game.setStartFrom({ file: URI, line: 3 });
    game.simulate();
    expect(game.simulationFailure).toBe("exhausted");
  }, 120_000);

  test("a file with no story flow is recorded as unroutable", () => {
    const program = compileSrc(NO_STORY_FLOW);
    const game: any = newGame(program);
    expect(game.setStartFrom({ file: URI, line: 1 })).toBeNull();
    expect(game.startAddress).toBe(TOP_LEVEL_START);
    game.simulate();
    expect(game.simulationFailure).toBe("unroutable");
  }, 120_000);

  test("a run from a line with no address starts at the top of the start scene", () => {
    const program = compileSrc(SCENE_THEN_DEFINE);
    const game: any = newGame(program);
    expect(game.setStartFrom({ file: URI, line: 5 })).toBeNull();
    expect(game.startAddress).toBe(TOP_LEVEL_START);
    game.jumpTo(game.startAddress);
    expect(String(game.story.Continue() ?? "").trim()).toBe(
      "First beat of the scene.",
    );
  }, 120_000);

  test("a route that replays without arriving is recorded as diverged", () => {
    const program = compileSrc(plainScene(10));
    const game: any = newGame(program);
    const toPath = startAddressForLine(program, 4);
    const route = Game.planRoute(game.story, program, "start", toPath);
    expect(route).not.toBeNull();

    game.simulateRoute({ ...route, to: NO_SUCH_ADDRESS }, 0);

    expect(game.simulation).toBe("fail");
    expect(game.simulationFailure).toBe("diverged");
  }, 120_000);

  test("a route that does arrive records no reason at all", () => {
    const program = compileSrc(plainScene(10));
    const game: any = newGame(program);
    const toPath = startAddressForLine(program, 4);
    const route = Game.planRoute(game.story, program, "start", toPath);

    game.simulateRoute(route, 0);

    expect(game.simulation).toBe("success");
    expect(game.simulationFailure).toBeUndefined();
  }, 120_000);

  test("a preview that succeeds records no reason at all", () => {
    const program = compileSrc(plainScene(20));
    const game: any = newGame(program);
    game.setStartFrom({ file: URI, line: 18 });
    game.simulate();
    expect(game.simulation).toBe("success");
    expect(game.simulationFailure).toBeUndefined();
  }, 120_000);

  test("a line after a call to a vararg function that branches still routes", () => {
    const program = compileSrc(
      `scene start\n  First {f("marker", 1)}.\n  Second.\nend\n\n` +
        `function f(...)\n  if ... then\n    return 1\n  end\n  return 2\nend\n`,
    );
    const game: any = newGame(program);
    game.setStartFrom({ file: URI, line: 2 });
    game.simulate();
    expect({
      simulation: game.simulation,
      failure: game.simulationFailure,
      endReason: lastSearchStats.endReason,
    }).toEqual({ simulation: "success", failure: undefined, endReason: "found" });
  }, 120_000);
});
