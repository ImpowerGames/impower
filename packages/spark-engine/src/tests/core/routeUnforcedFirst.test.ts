// I-1620: the route search follows the story's own run first. Where that run
// reaches a line, the route is that run, whatever its depth, even when a
// shallower route that forces a condition also reaches the line.
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  lastSearchStats,
  planRoute,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
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

const newGame = (program: unknown) =>
  new Game({
    program: program as any,
    now: () => 0,
    setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
      fn(...a);
      return 0;
    }) as any,
  } as any);

/** The address the preview targets for `line`, counting from zero. */
const addressOf = (program: unknown, line: number) => {
  const game = newGame(program);
  game.setStartFrom({ file: URI, line });
  return game.startAddress!;
};

// The `done` (line 7) is reached one decision deep by forcing the outer
// condition false, and two decisions deep by the run the story makes.
const NESTED = `scene start
  Before.
  if true then
    if true then
      Natural.
    end
  end
  done
end
`;

// The `done` (line 11) is reached one decision deep by forcing the outer
// condition false, and four decisions deep by the run the story makes.
const DEEP = `scene start
  Before.
  if true then
    if true then
      if true then
        if true then
          Natural.
        end
      end
    end
  end
  done
end
`;

// The story's own run never ends: only forcing the condition false reaches
// the exit (line 8).
const ENDLESS = `store n = 0

scene start
  Before {n}.
  & n = n + 1
  if true then
    -> start
  end
  Forced exit.
  done
end
`;

// The story chooses for itself: the conditional choice is not shown, and
// the invisible fallback runs on into the next scene, whose `done` is line
// 17.
const FALLBACK = `-> start

scene start
  Before.
  choose
    * if false Impossible.
    * -> fallback(1)
  end
end

scene fallback(n)
  Fallback {n}.
  if true then
    if true then
      Natural.
    end
  end
  done
end
`;

// The condition is true on the first lap and false on the second.
const LOOP = `store n = 0

-> start

scene start
  Lap {n}.
  & n = n + 1
  if n < 2 then
    -> start
  end
  Out.
  done
end
`;

describe("the story's own run is the route where it reaches the line", () => {
  test("over a shallower route that forces a condition", () => {
    const program = compileSrc(NESTED);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 7));
    expect(route?.conditions).toEqual([{ selected: true }, { selected: true }]);
  });

  test("over a verdict the caller favors", () => {
    const program = compileSrc(NESTED);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 7), {
      favoredConditions: [false],
    });
    expect(route?.conditions).toEqual([{ selected: true }, { selected: true }]);
  });

  test("when the run outlasts half the ceilings but fits in what the search leaves", () => {
    // The run needs five nodes and gets four first; the full search finds
    // the forced route in three, and the run goes on with the last one.
    const program = compileSrc(DEEP);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 11), {
      maxNodes: 8,
    });
    expect(route?.conditions).toEqual([
      { selected: true },
      { selected: true },
      { selected: true },
      { selected: true },
    ]);
    expect(lastSearchStats.endReason).toBe("found");
  });

  test("but not when the run cannot reach the line in what the search leaves", () => {
    // Three nodes first, three for the full search, and one is not enough
    // for the run's last two: the forced route stands, and the search says
    // a ceiling stopped it.
    const program = compileSrc(DEEP);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 11), {
      maxNodes: 7,
    });
    expect(route?.conditions).toEqual([{ selected: false }]);
    expect(lastSearchStats.exhaustedBudget).toBe(true);
  });

  test("through a condition it meets again with another verdict", () => {
    const program = compileSrc(LOOP);
    const lap = addressOf(program, 5);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 11));
    expect(route?.conditions).toEqual([{ selected: true }, { selected: false }]);
    // The run passes the lap twice, as the story does.
    expect(route?.steps.filter((s) => s.address === lap).length).toBe(2);
  });

  test("through a choice's condition the story evaluates itself", () => {
    const program = compileSrc(FALLBACK);
    const game = newGame(program);
    const route = Game.planRouteFromStart(game.story, program as any, addressOf(program, 17));
    expect(route?.conditions).toEqual([
      { selected: false },
      { selected: true },
      { selected: true },
    ]);
  });
});

describe("a line only a forced condition reaches", () => {
  test("is routed by the full search", () => {
    const program = compileSrc(`scene start
  Before.
  if false then
    Forced.
  end
  done
end
`);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 3));
    expect(route?.conditions).toEqual([{ selected: true }]);
  });

  test("is routed past a run of the story's own that never ends", () => {
    const program = compileSrc(ENDLESS);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 8), {
      maxSteps: 200,
      searchTimeout: Number.MAX_SAFE_INTEGER,
    });
    expect(route?.conditions.at(-1)).toEqual({ selected: false });
    expect(lastSearchStats.endReason).toBe("found");
  });
});
