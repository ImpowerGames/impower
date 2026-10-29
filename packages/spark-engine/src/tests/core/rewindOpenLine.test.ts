import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { Game } from "../../game/core/classes/Game";
import { requireChunks } from "../harness/compileProgram";

const URI = "inmemory:///main.sd";

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

const UNFINISHABLE_LINE = [
  "-> a",
  "",
  "scene a",
  "  -> b",
  "end",
  "",
  "scene b",
  "  -> a",
  "end",
  "",
].join("\n");

const ORDINARY = [
  "-> start",
  "",
  "scene start",
  "  The first thing that happens.",
  "  The second thing that happens.",
  "  The third thing that happens.",
  "end",
  "",
].join("\n");

const newGame = (program: unknown, executionStepLimit?: number) =>
  new Game({
    program: program as any,
    now: () => performance.now(),
    ...(executionStepLimit ? { executionStepLimit } : {}),
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

interface Probe {
  game: Game;
  errors: string[];
  advances(): number;
  capAdvances(extra: number): void;
  midLine(): boolean;
  discards(): { count: number; advancesSpent: number };
}

const probe = (game: Game): Probe => {
  const anyGame = game as any;
  const errors: string[] = [];
  const realError = anyGame.Error.bind(anyGame);
  anyGame.Error = (message: string, ...rest: unknown[]) => {
    errors.push(String(message));
    return realError(message, ...rest);
  };

  const story: any = game.story;
  let advances = 0;
  let cap = Infinity;
  const realSingleStep = story.ContinueSingleStep.bind(story);
  story.ContinueSingleStep = () => {
    advances += 1;
    if (advances > cap) {
      throw new Error(
        `story advanced past the ${cap}-advance cap this test imposes: ` +
          `the path under test is unbounded`,
      );
    }
    return realSingleStep();
  };

  let discardCount = 0;
  let discardAdvances = 0;
  const realDiscard = anyGame.discardOpenStoryLine.bind(anyGame);
  anyGame.discardOpenStoryLine = () => {
    discardCount += 1;
    const before = advances;
    try {
      return realDiscard();
    } finally {
      discardAdvances += advances - before;
    }
  };

  return {
    game,
    errors,
    advances: () => advances,
    capAdvances: (extra: number) => {
      cap = advances + extra;
    },
    midLine: () => story.canContinue && !story.asyncContinueComplete,
    discards: () => ({ count: discardCount, advancesSpent: discardAdvances }),
  };
};

const stoppedMidUnfinishableLine = () => {
  const program = compileSrc(UNFINISHABLE_LINE);
  const p = probe(newGame(program, 5_000));
  p.game.start();

  expect(p.errors.join("\n")).toContain("possible infinite loop");
  expect(p.midLine()).toBe(true);
  p.errors.length = 0;
  return p;
};

const resetCostWithNothingOpen = () => {
  const p = probe(newGame(compileSrc(UNFINISHABLE_LINE), 5_000));
  const before = p.advances();
  p.game.reset();
  expect(p.midLine()).toBe(false);
  return p.advances() - before;
};

const expectDiscardedForFree = (p: Probe) => {
  const { count, advancesSpent } = p.discards();
  expect(count).toBeGreaterThan(0);
  expect(advancesSpent).toBe(0);
};

const driveToOpenLine = () => {
  const p = probe(newGame(compileSrc(ORDINARY)));
  const story: any = p.game.story;
  story.ChoosePathString("start");
  for (let i = 0; i < 60 && story.canContinue; i += 1) {
    story.ContinueAsync();
    if (p.midLine()) {
      return p;
    }
  }
  throw new Error("fixture never reached an open line");
};

describe("letting go of a line the story cannot finish", () => {
  test("the rewind does not advance the story at all", () => {
    const baseline = resetCostWithNothingOpen();

    const p = stoppedMidUnfinishableLine();
    const before = p.advances();
    p.capAdvances(baseline + 100_000);
    p.game.reset();

    expect(p.advances() - before).toBe(baseline);
    expectDiscardedForFree(p);
  }, 300_000);

  test("the story is genuinely left replaceable", () => {
    const p = stoppedMidUnfinishableLine();
    p.capAdvances(200_000);

    expect(() => p.game.reset()).not.toThrow();
    expect(p.midLine()).toBe(false);
  }, 300_000);

  test("jumping to a path lets go of the line the same way", () => {
    const baseline = resetCostWithNothingOpen();
    const p = stoppedMidUnfinishableLine();
    const before = p.advances();
    p.capAdvances(baseline + 100_000);

    expect(() => p.game.jumpToFlow("a")).not.toThrow();
    expect(p.midLine()).toBe(false);
    expect(p.advances() - before).toBe(baseline);
    expectDiscardedForFree(p);
  }, 300_000);

  test("loading a save lets go of the line the same way", () => {
    const save = newGame(compileSrc(UNFINISHABLE_LINE), 5_000).save();
    const p = stoppedMidUnfinishableLine();
    p.capAdvances(200_000);

    expect(() => p.game.load(save)).not.toThrow();
    expect(p.midLine()).toBe(false);
    expectDiscardedForFree(p);
  }, 300_000);

  test("a save that cannot be read leaves the open line alone", () => {
    const p = driveToOpenLine();
    expect(p.midLine()).toBe(true);

    expect(p.game.load("{ this is not a save")).toBe(false);

    expect(p.discards().count).toBe(0);
    expect(p.midLine()).toBe(true);
  }, 300_000);

  test("the STOP-to-PLAY restart lets go of the line the same way", () => {
    const p = stoppedMidUnfinishableLine();
    (p.game as any)._simulation = "fail";
    p.capAdvances(200_000);

    expect(() => p.game.start()).not.toThrow();
    expectDiscardedForFree(p);
  }, 300_000);

  test("the preview's own recovery path no longer re-enters the loop", async () => {
    const p = probe(newGame(compileSrc(UNFINISHABLE_LINE), 5_000));

    (p.game as any)._simulation = "fail";
    expect(await p.game.preview(URI, 3)).toBeTruthy();
    expect(p.errors.join("\n")).toContain("possible infinite loop");
    expect(p.midLine()).toBe(true);

    (p.game as any)._simulation = "fail";
    p.capAdvances(200_000);
    expect(await p.game.preview(URI, 2)).toBeTruthy();

    expectDiscardedForFree(p);
  }, 300_000);
});

describe("the route planner lets go of an open line too", () => {
  test("planning a route returns instead of running forever", () => {
    const program = compileSrc(UNFINISHABLE_LINE);
    const game = newGame(program);
    const anyGame = game as any;
    const story: any = game.story;

    let advances = 0;
    const cap = 600_000;
    const realSingleStep = story.ContinueSingleStep.bind(story);
    story.ContinueSingleStep = () => {
      advances += 1;
      if (advances > cap) {
        throw new Error(
          `story advanced past the ${cap}-advance cap this test imposes: ` +
            `route planning is unbounded`,
        );
      }
      return realSingleStep();
    };

    game.setStartFrom({ file: URI, line: 3 });
    const toPath = anyGame.startAddress!;
    expect(toPath).toBeTruthy();

    expect(() =>
      Game.planRoute(
        game.story,
        program as any,
        anyGame.routeStartOf(toPath),
        toPath,
      ),
    ).not.toThrow();
  }, 300_000);
});

describe("letting go of an ordinary open line", () => {
  test("loading a save lets go of it", () => {
    const save = newGame(compileSrc(ORDINARY)).save();
    const p = driveToOpenLine();
    p.capAdvances(200_000);
    const before = p.advances();

    expect(p.game.load(save)).toBe(true);

    expect(p.midLine()).toBe(false);
    expect(p.advances() - before).toBe(0);
  }, 300_000);

  test("rewinding lets go of it, and the story still replays correctly", () => {
    const p = driveToOpenLine();
    p.capAdvances(200_000);
    p.game.reset();

    expect(p.midLine()).toBe(false);
    expectDiscardedForFree(p);

    const story: any = p.game.story;
    story.ChoosePathString("start");
    const lines: string[] = [];
    let guard = 0;
    while (story.canContinue && guard < 10_000) {
      guard += 1;
      const text = String(story.Continue() ?? "").trim();
      if (text) {
        lines.push(text);
      }
    }
    expect(lines).toEqual([
      "The first thing that happens.",
      "The second thing that happens.",
      "The third thing that happens.",
    ]);
  }, 300_000);
});

describe("a cancel is refused from inside a continue", () => {
  test("it throws rather than turning the running slice unbounded", () => {
    const game = newGame(compileSrc(ORDINARY));
    const story: any = game.story;
    story.ChoosePathString("start");

    let thrown: Error | null = null;
    const realStep = story.ContinueSingleStep.bind(story);
    story.ContinueSingleStep = () => {
      if (!thrown) {
        try {
          story.CancelAsyncContinue();
        } catch (e) {
          thrown = e as Error;
        }
      }
      return realStep();
    };

    story.ContinueAsync();
    expect(thrown).not.toBeNull();
    expect(String(thrown)).toContain("CancelAsyncContinue");
  }, 300_000);
});

describe("ordinary content is unaffected", () => {
  test("a normal story resets with nothing reported", () => {
    const p = probe(newGame(compileSrc(ORDINARY)));
    p.game.start();
    p.game.reset();
    expect(p.errors).toEqual([]);
    expect(p.midLine()).toBe(false);
  }, 300_000);

  test("a normal story replays its lines in order after a rewind", () => {
    const program = compileSrc(ORDINARY);
    const game = newGame(program);
    const story: any = game.story;

    const readAll = () => {
      const lines: string[] = [];
      let guard = 0;
      while (story.canContinue && guard < 10_000) {
        guard += 1;
        const text = String(story.Continue() ?? "").trim();
        if (text) {
          lines.push(text);
        }
      }
      return lines;
    };

    game.jumpToFlow("start");
    const first = readAll();
    expect(first).toEqual([
      "The first thing that happens.",
      "The second thing that happens.",
      "The third thing that happens.",
    ]);

    game.jumpToFlow("start");
    expect(readAll()).toEqual(first);
  }, 300_000);
});
