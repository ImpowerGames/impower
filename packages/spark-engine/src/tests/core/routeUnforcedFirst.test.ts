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

  test("under a ceiling the run fits in", () => {
    const program = compileSrc(NESTED);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 7), {
      maxNodes: 5,
    });
    expect(route?.conditions).toEqual([{ selected: true }, { selected: true }]);
    expect(lastSearchStats.endReason).toBe("found");
  });

  test("and a ceiling that cuts the run short ends the search", () => {
    // Two nodes run the story to its second condition, short of the line:
    // the search gave up, and a forced route is no answer to that.
    const program = compileSrc(NESTED);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 7), {
      maxNodes: 2,
    });
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("max-nodes");
  });

  test("through a condition it meets again with another verdict", () => {
    const program = compileSrc(LOOP);
    const lap = addressOf(program, 5);
    const route = planRoute(newGame(program).story, "start", addressOf(program, 11));
    expect(route?.conditions).toEqual([{ selected: true }, { selected: false }]);
    // The run passes the lap twice, as the story does.
    expect(route?.steps.filter((s) => s.address === lap).length).toBe(2);
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
});
