import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  DEFAULT_MAX_STEPS,
  lastSearchStats,
  planRoute,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
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

function longScene(beats: number): string {
  const lines = ["", "", "scene start"];
  for (let i = 0; i < beats; i += 1) {
    lines.push(`  Beat number ${i} of the long scene.`);
  }
  lines.push("end", "");
  return lines.join("\n");
}

function targetPathForLine(program: unknown, line: number): ProgramAddress {
  const game = newGame(program);
  game.setStartFrom({ file: URI, line });
  return game.startAddress!;
}

describe("a long scene is not mistaken for an unreachable one", () => {
  test("a 24,000 line scene plans a complete route to its last beat", () => {
    const beats = 24_000;
    const program = compileSrc(longScene(beats));
    const toPath = targetPathForLine(program, beats + 2);
    expect(toPath).not.toBe(TOP_LEVEL_START);

    const game = newGame(program);
    const route = Game.planRoute(
      game.story,
      program as any,
      newGame(program).routeStartOf(toPath),
      toPath,
    );

    expect(route).toBeTruthy();
    expect(route!.steps.length).toBeGreaterThan(100_000);
    expect(route!.steps.at(-1)!.address).toBe(toPath);
    expect(route!.to).toBe(toPath);
  }, 300_000);
});

describe("the declared budget decides the verdict, and decides it the same way every time", () => {
  const SCENE = longScene(300);

  const planWithBudget = (program: unknown, toPath: ProgramAddress, maxSteps: number) =>
    planRoute(newGame(program).story, "start", toPath, {
      stayWithinKnot: true,
      maxSteps,
    });

  test("one advance below what the scene needs fails, and at it succeeds", () => {
    const program = compileSrc(SCENE);
    const toPath = targetPathForLine(program, 302);
    expect(toPath).not.toBe(TOP_LEVEL_START);

    let low = 1;
    let high = 200_000;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if (planWithBudget(program, toPath, mid)) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    const needed = low;
    expect(needed).toBeGreaterThan(1_000);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(planWithBudget(program, toPath, needed)).toBeTruthy();
      expect(planWithBudget(program, toPath, needed - 1)).toBeNull();
    }
  }, 300_000);
});

describe("the ceiling is calibrated against what the editor compiles", () => {
  const MEASURED_EDITOR_COST_17K_LINES = 611_984;

  test("the default leaves room for a scene several times longer", () => {
    expect(DEFAULT_MAX_STEPS).toBeGreaterThan(
      MEASURED_EDITOR_COST_17K_LINES * 3,
    );
  });
});

describe("a budget of N permits N, not N minus one", () => {
  test("a fork-free scene plans with a single node expansion", () => {
    const program = compileSrc(longScene(20));
    const toPath = targetPathForLine(program, 22);
    expect(toPath).not.toBe(TOP_LEVEL_START);

    const route = planRoute(newGame(program).story, "start", toPath, {
      stayWithinKnot: true,
      maxNodes: 1,
    });
    expect(route).toBeTruthy();
    expect(route!.steps.at(-1)!.address).toBe(toPath);
  }, 120_000);

  test("a budget of zero nodes explores nothing", () => {
    const program = compileSrc(longScene(20));
    const toPath = targetPathForLine(program, 22);
    const route = planRoute(newGame(program).story, "start", toPath, {
      stayWithinKnot: true,
      maxNodes: 0,
    });
    expect(route).toBeNull();
  }, 120_000);
});

describe("a story that never terminates still gives up", () => {
  const DIVERT_LOOP = `

scene start
  Going round.
  -> start
end
`;

  const CHOICE_LOOP = `

scene start
  Before the loop.
  choose
  + [Go around again]
    Round we go.
    -> start
  + [Move on]
    Leaving the loop.
  then
    After the choice.
  end
end
`;

  test.each([
    ["a scene that diverts to itself", DIVERT_LOOP],
    ["a choice that loops back to the top", CHOICE_LOOP],
  ])("%s ends the search instead of hanging", (_name, src) => {
    const program = compileSrc(src);
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
    expect(lastSearchStats.exhaustedBudget).toBe(true);
  }, 120_000);
});

describe("a position already expanded is not expanded again", () => {
  const BRANCH_IN_LOOP = `store flag = false



scene start
  Opening beat.
  if flag then
    Went down the true side.
  else
    Went down the false side.
  end
  -> start
end
`;

  const PLAIN_LOOP = `

scene start
  Going round.
  -> start
end
`;

  const searchForMissingTarget = (src: string) => {
    const program = compileSrc(src);
    planRoute(newGame(program).story, "start", NO_SUCH_ADDRESS, {
      stayWithinKnot: true,
      maxSteps: 400_000,
      maxNodes: 10_000,
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    return { ...lastSearchStats };
  };

  test("a decision inside a loop stops early instead of running to the ceiling", () => {
    const withBranch = searchForMissingTarget(BRANCH_IN_LOOP);
    expect(withBranch.forkSitesSkipped).toBeGreaterThan(0);
    expect(withBranch.exhaustedBudget).toBe(false);
    expect(withBranch.stepsUsed).toBeLessThan(100_000);
  }, 300_000);

  test("a loop with no decision in it has nothing to skip, and runs to the ceiling", () => {
    const plain = searchForMissingTarget(PLAIN_LOOP);
    expect(plain.forkSitesSkipped).toBe(0);
    expect(plain.exhaustedBudget).toBe(true);
    expect(plain.stepsUsed).toBeGreaterThanOrEqual(400_000);
  }, 300_000);
});

describe("every branch of a decision stays reachable", () => {
  const TWO_BRANCHES = `store flag = false



scene start
  Opening beat.
  if flag then
    Went down the true side.
  else
    Went down the false side.
  end
  Shared beat after the branch.
end
`;

  test("the true side and the false side both plan a route", () => {
    const program = compileSrc(TWO_BRANCHES);

    const truePath = targetPathForLine(program, 7);
    const falsePath = targetPathForLine(program, 9);
    expect(truePath).not.toBe(TOP_LEVEL_START);
    expect(falsePath).not.toBe(TOP_LEVEL_START);
    expect(truePath).not.toBe(falsePath);

    const planTo = (toPath: ProgramAddress) =>
      Game.planRoute(
        newGame(program).story,
        program as any,
        newGame(program).routeStartOf(toPath),
        toPath,
      );

    const viaTrue = planTo(truePath);
    expect(viaTrue).toBeTruthy();
    expect(viaTrue!.conditions.map((c) => c.selected)).toEqual([true]);
    expect(viaTrue!.steps.at(-1)!.address).toBe(truePath);

    const viaFalse = planTo(falsePath);
    expect(viaFalse).toBeTruthy();
    expect(viaFalse!.conditions.map((c) => c.selected)).toEqual([false]);
    expect(viaFalse!.steps.at(-1)!.address).toBe(falsePath);
  }, 120_000);

  test("a beat after the branch is still reachable", () => {
    const program = compileSrc(TWO_BRANCHES);
    const toPath = targetPathForLine(program, 11);
    expect(toPath).not.toBe(TOP_LEVEL_START);
    const route = Game.planRoute(
      newGame(program).story,
      program as any,
      newGame(program).routeStartOf(toPath),
      toPath,
    );
    expect(route).toBeTruthy();
    expect(route!.steps.at(-1)!.address).toBe(toPath);
  }, 120_000);
});
