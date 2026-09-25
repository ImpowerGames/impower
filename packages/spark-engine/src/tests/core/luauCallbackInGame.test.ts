// #828 — a story line whose Luau code makes the runtime call back into a Luau
// function (a sort comparator, a gsub replacement, pcall, table.foreach or a
// metamethod) runs in a running game as it does under a synchronous continue.

import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import {
  lastSearchStats,
  planRoute,
} from "@impower/sparkdown/src/compiler/utils/planRoute";
import { Game } from "../../game/core/classes/Game";
import { createHarness } from "../ui/harness/uiTestHarness";

const URI = "inmemory:///main.sd";

const compileProgram = (source: string) => {
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
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const program = compiler.compile({
    textDocument: { uri: URI },
    countAllVisits: true,
  }).program;
  expect(program.compiled).toBeTruthy();
  return program;
};

const runtimeErrors = (messages: any[]) =>
  messages
    .filter((m) => m.method === "game/runtimeError")
    .map((m) => m.params.message);

/** The text the story's last completed continue produced, or a marker when
 *  the step threw out part way through a continue. */
const shownText = (game: Game) => {
  try {
    return String(game.story.currentText ?? "").trim();
  } catch {
    return "<continue left unfinished>";
  }
};

/** Play from `A`, the story's first line, then run the beat after it. The
 *  fixtures declare functions above the story, so their line 0 is not a line
 *  of story flow. */
const playSecondBeat = async (source: string) => {
  const h = createHarness(source, source.split("\n").indexOf("A"));
  await h.ready;
  h.reset();
  h.game.start();
  expect(runtimeErrors(h.messages)).toEqual([]);
  expect(shownText(h.game)).toBe("A");
  h.reset();
  let threw = "";
  try {
    h.game.continue();
  } catch (e) {
    threw = (e as Error).message;
  }
  return {
    h,
    threw,
    errors: runtimeErrors(h.messages),
    text: shownText(h.game),
    canContinue: h.game.story.canContinue,
  };
};

const CASES: [name: string, source: string, text: string][] = [
  [
    "table.sort with an inline comparator in a display line",
    `store t = {3, 1, 2}\nA\n{table.sort(t, function(a, b) return a < b end)} B {t[1]}\nC\n`,
    "B 1",
  ],
  [
    "table.sort with an inline comparator in a logic line",
    `store t = {3, 1, 2}\nA\n& table.sort(t, function(a, b) return a < b end)\nB {t[1]}\nC\n`,
    "B 1",
  ],
  [
    "table.sort with a named comparator",
    `function less(a, b)\n  return a < b\nend\n\nstore t = {3, 1, 2}\nA\nB {table.sort(t, less)} {t[1]}\nC\n`,
    "B  1",
  ],
  [
    "string.gsub with a replacement function",
    `store s = ""\nA\n& s = string.gsub("abc", "b", function(m) return "X" end)\nB {s}\nC\n`,
    "B aXc",
  ],
  [
    "an __index metamethod",
    `store obj = setmetatable({}, { __index = function(t, k) return "found" end })\nA\nB {obj.missing}\nC\n`,
    "B found",
  ],
  [
    "an __add metamethod",
    `store v = setmetatable({}, { __add = function(a, b) return 7 end })\nA\nB {v + 1}\nC\n`,
    "B 7",
  ],
  [
    "a __newindex metamethod",
    `store seen = ""\nstore obj = setmetatable({}, { __newindex = function(t, k, v) seen = k end })\nA\n& obj.name = 1\nB {seen}\nC\n`,
    "B name",
  ],
  [
    "a __call metamethod",
    `store f = setmetatable({}, { __call = function(self, x) return x * 2 end })\nA\nB {f(4)}\nC\n`,
    "B 8",
  ],
  [
    "pcall of a function",
    `A\nB {select(2, pcall(function() return "ok" end))}\nC\n`,
    "B ok",
  ],
  [
    "table.foreach with a function",
    `store total = 0\nA\n& table.foreach({1, 2, 3}, function(k, v) total = total + v end)\nB {total}\nC\n`,
    "B 6",
  ],
  [
    "table.sort with no comparator",
    `store t = {3, 1, 2}\nA\n& table.sort(t)\nB {t[1]}\nC\n`,
    "B 1",
  ],
];

describe("a Luau callback run from a story line in a running game", () => {
  test.each(CASES)("%s runs, shows its line and carries on", async (_, source, text) => {
    const result = await playSecondBeat(source);
    expect({
      threw: result.threw,
      errors: result.errors,
      text: result.text,
      canContinue: result.canContinue,
    }).toEqual({ threw: "", errors: [], text, canContinue: true });

    result.h.reset();
    result.h.game.continue();
    expect(runtimeErrors(result.h.messages)).toEqual([]);
    expect(shownText(result.h.game)).toBe("C");
  });
});

// A callback runs all of its steps inside the one step of the story line that
// called it. Those steps still count: against the callback's own limit, which
// includes the callbacks nested inside it, and against the game's execution
// budget, which is what stops a running game that runs away.
describe("a callback's steps", () => {
  test("count against the step limit of the callback they are nested in", async () => {
    // About a million steps in all, though the outer function takes only a
    // few thousand of its own.
    const result = await playSecondBeat(
      `store ok = true\nA\n& ok = pcall(function() for i = 1, 1000 do pcall(function() for j = 1, 200 do end end) end end)\nB {ok}\nC\n`,
    );
    expect(result.errors).toEqual([]);
    expect(result.threw).toBe("");
    expect(result.text).toBe("B false");
  });

  const LOOPING_CALLBACK = `-> start

scene start
  A
  & table.foreach({1}, function(k, v) for i = 1, 2000 do end end)
  B
end
`;

  test("count against a route search's step budget", () => {
    const program = compileProgram(LOOPING_CALLBACK);
    const locator: any = new Game({ program: program as any } as any);
    locator.setStartFrom({
      file: URI,
      line: LOOPING_CALLBACK.split("\n").indexOf("  B"),
    });
    const route = planRoute(
      new Game({ program: program as any } as any).story,
      "start",
      locator.startPath as string,
      { maxSteps: 5000, searchTimeout: Number.MAX_SAFE_INTEGER },
    );
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("max-steps");
  });

  /** Replay the route to the `  B` line of `source` under an execution budget
   *  of `limit` steps, returning the errors the game reported. */
  const replayToB = (source: string, limit: number) => {
    const program = compileProgram(source);
    const game = new Game({
      program: program as any,
      executionStepLimit: limit,
      now: () => 0,
      setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
        fn(...a);
        return 0;
      }) as any,
    } as any);
    const anyGame = game as any;
    const errors: string[] = [];
    const realError = anyGame.Error.bind(anyGame);
    anyGame.Error = (message: string, ...rest: unknown[]) => {
      errors.push(String(message));
      return realError(message, ...rest);
    };
    game.setStartFrom({ file: URI, line: source.split("\n").indexOf("  B") });
    const toPath = anyGame.startPath as string;
    const route = Game.planRoute(
      game.story,
      program as any,
      Game.getSimulateFromPath(toPath),
      toPath,
    );
    expect(route).not.toBeNull();
    game.patchAndSimulateRoute(route!);
    return { game, errors };
  };

  test("count against the running game's execution budget", () => {
    const { errors } = replayToB(LOOPING_CALLBACK, 5000);
    expect(errors).toEqual([
      "Execution exceeded 5000 steps: possible infinite loop",
    ]);
  });

  // A native loop can call short callbacks for as long as they keep giving it
  // more to do: `table.foreach` over a table its callback appends to never
  // runs out. Every callback stays far inside its own limit, so only the
  // budget can stop the step, and it has to while the callbacks are running.
  // The fixture stops growing at 20,000 entries so that a budget which waits
  // for the step to end still finishes.
  const GROWING_FOREACH = `-> start

store t = {1}

scene start
  A
  & table.foreach(t, function(k, v) if #t < 20000 then table.insert(t, v) end end)
  B
end
`;

  test("are stopped by the running game's execution budget while they run", () => {
    const { game, errors } = replayToB(GROWING_FOREACH, 5000);
    expect(errors).toEqual([
      "Execution exceeded 5000 steps: possible infinite loop",
    ]);
    const t = game.story.variablesState.GetVariableWithName("t") as any;
    expect((t.value as Map<unknown, unknown>).size).toBeLessThan(5000);
  });

  // A step the budget stopped part way through cannot be resumed: the
  // operation it was running has already taken its arguments. The story ends
  // there, so driving the game again reports nothing the story did not do.
  test.each([
    ["a continue", (game: Game) => game.continue()],
    ["a step in", (game: Game) => game.step("in")],
    ["a step over", (game: Game) => game.step("over")],
    ["a step out", (game: Game) => game.step("out")],
  ])(
    "stopped by a running game's budget end the story, and %s after reports nothing",
    async (_, drive) => {
      const source = `store t = {1}\nA\n& table.foreach(t, function(k, v) if #t < 20000 then table.insert(t, v) end end)\nB\nC\n`;
      const h = createHarness(source, source.split("\n").indexOf("A"), {
        beforeConnect: (game) => {
          (game as any)._executionStepLimit = 5000;
        },
      });
      await h.ready;
      h.game.start();
      h.reset();
      h.game.continue();
      expect(runtimeErrors(h.messages)).toEqual([
        "Execution exceeded 5000 steps: possible infinite loop",
      ]);
      expect(h.game.story.canContinue).toBe(false);

      h.reset();
      drive(h.game);
      expect(runtimeErrors(h.messages)).toEqual([]);
      expect(h.game.story.canContinue).toBe(false);
    },
  );

  // `table.sort` and `string.gsub` report an error their callback raises as
  // their own. The budget running out is not the callback's error.
  test.each([
    [
      "table.sort",
      `& table.sort(t, function(a, b) for i = 1, 2000 do end return a < b end)`,
    ],
    [
      "string.gsub",
      `& s = string.gsub("aaaa", "a", function(m) for i = 1, 2000 do end return "b" end)`,
    ],
  ])(
    "stopped inside %s are reported as the budget running out",
    (_, line) => {
      const source = `-> start

store t = {5, 4, 3, 2, 1}
store s = ""

scene start
  A
  ${line}
  B
end
`;
      const { errors } = replayToB(source, 5000);
      expect(errors).toEqual([
        "Execution exceeded 5000 steps: possible infinite loop",
      ]);
    },
  );

  test("are stopped by a route search's step budget while they run", () => {
    const program = compileProgram(GROWING_FOREACH);
    const locator: any = new Game({ program: program as any } as any);
    locator.setStartFrom({
      file: URI,
      line: GROWING_FOREACH.split("\n").indexOf("  B"),
    });
    const route = planRoute(
      new Game({ program: program as any } as any).story,
      "start",
      locator.startPath as string,
      { maxSteps: 5000, searchTimeout: Number.MAX_SAFE_INTEGER },
    );
    expect(route).toBeNull();
    expect(lastSearchStats.endReason).toBe("max-steps");
    // The step the budget ran out in is the only one that can overrun it.
    expect(lastSearchStats.stepsUsed).toBeLessThanOrEqual(5001);
  });
});

// Route search pauses the story before each condition so it can force the
// result. A comparator's own `if` is not one of the story's decisions, so the
// sort runs through it and the search reaches the line after the sort.
describe("a route search past a sort whose comparator has an if", () => {
  const SOURCE = `-> start

function less(a, b)
  if a < b then
    return true
  end
  return false
end

store t = {3, 1, 2}

scene start
  A
  & table.sort(t, less)
  B {t[1]}
  C
end
`;

  test("finds the route to the line after the sort", () => {
    const program = compileProgram(SOURCE);
    const newGame = () =>
      new Game({
        program: program as any,
        now: () => 0,
        setTimeout: ((fn: Function, _ms?: number, ...a: any[]) => {
          fn(...a);
          return 0;
        }) as any,
      } as any);
    const targetLine = SOURCE.split("\n").indexOf("  C");
    const locator: any = newGame();
    locator.setStartFrom({ file: URI, line: targetLine });
    const toPath = locator.startPath as string;

    const route = Game.planRoute(newGame().story, program, "start", toPath);
    expect(lastSearchStats.endReason).toBe("found");
    expect(route).not.toBeNull();
  }, 120_000);
});
