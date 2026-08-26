import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { beforeAll, describe, expect, it } from "vitest";
import { Game } from "./Game";

/**
 * `Game.step()` / `continue()` are the flow engine: they drive the story
 * forward, decide when to stop and wait for the player, checkpoint, and tell
 * the host what happened. None of that is observable from a return value
 * alone, so these tests assert on the notifications the game emits -- that is
 * its actual contract with whatever is hosting it.
 *
 * Driving this needs a real compiled program; a fake story can't model the
 * flush/wait handoff that is the whole point. Like the save/load suite, that
 * makes this one of the slower files in the package.
 *
 * Deliberately out of scope: the `in` / `out` / `over` traversal modes and
 * breakpoint stops. Those only engage mid-flow with a debugger attached, and
 * they belong with the debug-adapter work rather than here.
 */

const THREE_BEATS = ["First beat.", "Second beat.", "Third beat.", ""].join(
  "\n",
);

const compile = (source: string) => {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return compiler.compile({ textDocument: { uri } } as never).program;
};

let program: ReturnType<typeof compile>;

beforeAll(() => {
  program = compile(THREE_BEATS);
});

interface Recorded {
  method: string;
  params: Record<string, unknown> | undefined;
}

const createGame = (
  overrides: { now?: () => number; executionStepLimit?: number } = {},
) => {
  const game = new Game({
    program,
    now: overrides.now ?? (() => 0),
    executionStepLimit: overrides.executionStepLimit,
    setTimeout: (handler: Function) => {
      handler();
      return 0;
    },
  } as never);

  const emitted: Recorded[] = [];
  game.connection.outgoing.addListener("*", (message) => {
    emitted.push({
      method: (message as Recorded).method,
      params: (message as Recorded).params,
    });
  });

  return {
    game,
    emitted,
    /** Just the game/* notifications, in order -- UI churn isn't the contract. */
    gameMethods: () =>
      emitted.map((e) => e.method).filter((m) => m.startsWith("game/")),
    clear: () => {
      emitted.length = 0;
    },
  };
};

describe("Game flow", () => {
  it("compiles the fixture without diagnostics", () => {
    expect(program.diagnostics ?? {}).toEqual({});
    expect(program.compiled).toBeTruthy();
  });

  describe("starting", () => {
    it("reports that it started, executed, and is now waiting", () => {
      const { game, gameMethods } = createGame();
      game.start();
      expect(gameMethods()).toEqual([
        "game/started",
        "game/awaitingInteraction",
        "game/executed",
      ]);
    });

    it("enters the running state", () => {
      const { game } = createGame();
      game.start();
      expect(game.state).toBe("running");
    });

    it("stops on the first beat rather than running the whole script", () => {
      const { game } = createGame();
      game.start();
      expect(game.story.currentText).toBe("First beat.\n");
    });

    it("checkpoints the opening beat", () => {
      const { game } = createGame();
      game.start();
      expect(game.checkpoints).toHaveLength(1);
    });

    it("reports which paths it executed", () => {
      const { game, emitted } = createGame();
      game.start();
      const executed = emitted.find((e) => e.method === "game/executed");
      expect(executed?.params?.["state"]).toBe("running");
      expect(
        (executed?.params?.["executedPaths"] as string[]).length,
      ).toBeGreaterThan(0);
    });
  });

  describe("advancing", () => {
    it("moves to the next beat", () => {
      const { game } = createGame();
      game.start();
      game.clickedToContinue();
      expect(game.story.currentText).toBe("Second beat.\n");
    });

    it("waits again on the next beat", () => {
      const { game, gameMethods, clear } = createGame();
      game.start();
      clear();
      game.clickedToContinue();
      expect(gameMethods()).toEqual([
        "game/awaitingInteraction",
        "game/executed",
        "game/clickedToContinue",
      ]);
    });

    it("checkpoints every beat", () => {
      const { game } = createGame();
      game.start();
      expect(game.checkpoints).toHaveLength(1);
      game.clickedToContinue();
      expect(game.checkpoints).toHaveLength(2);
      game.clickedToContinue();
      expect(game.checkpoints).toHaveLength(3);
    });

    it("walks the whole script one beat at a time", () => {
      const { game } = createGame();
      game.start();
      const seen = [game.story.currentText];
      game.clickedToContinue();
      seen.push(game.story.currentText);
      game.clickedToContinue();
      seen.push(game.story.currentText);
      expect(seen).toEqual([
        "First beat.\n",
        "Second beat.\n",
        "Third beat.\n",
      ]);
    });

    it("stops waiting once the script runs out", () => {
      const { game, gameMethods, clear } = createGame();
      game.start();
      game.clickedToContinue();
      game.clickedToContinue();
      clear();
      game.clickedToContinue(); // past the last beat
      expect(gameMethods()).not.toContain("game/awaitingInteraction");
    });

    it("reports that it finished once the script runs out", () => {
      const { game, gameMethods, clear } = createGame();
      game.start();
      game.clickedToContinue();
      game.clickedToContinue();
      clear();
      game.clickedToContinue(); // past the last beat
      expect(gameMethods()).toContain("game/finished");
    });

    // The last beat still has to be readable before the story is declared
    // over -- finishing early would cut off the final line.
    it("does not report finished while a beat is still waiting to be read", () => {
      const { game, gameMethods } = createGame();
      game.start();
      expect(gameMethods()).not.toContain("game/finished");

      game.clickedToContinue();
      expect(gameMethods()).not.toContain("game/finished");

      game.clickedToContinue(); // now showing the final beat
      expect(game.story.currentText).toBe("Third beat.\n");
      expect(gameMethods()).not.toContain("game/finished");
    });

    // A one-beat script is the tightest case: the story is already exhausted
    // when the only beat is flushed, so an over-eager check would declare it
    // finished before the player has read anything.
    it("shows a single-beat script before reporting finished", () => {
      const oneBeat = compile("Only beat.\n");
      const game = new Game({
        program: oneBeat,
        now: () => 0,
        setTimeout: (handler: Function) => {
          handler();
          return 0;
        },
      } as never);
      const methods: string[] = [];
      game.connection.outgoing.addListener("*", (m) =>
        methods.push((m as { method: string }).method),
      );

      game.start();
      expect(game.story.currentText).toBe("Only beat.\n");
      expect(methods).not.toContain("game/finished");

      game.clickedToContinue();
      expect(methods).toContain("game/finished");
    });

    it("reports finished exactly once", () => {
      const { game, emitted } = createGame();
      game.start();
      game.clickedToContinue();
      game.clickedToContinue();
      game.clickedToContinue();
      expect(emitted.filter((e) => e.method === "game/finished")).toHaveLength(
        1,
      );
    });
  });

  // `step()` is one iteration of the flow loop, not one beat: it reports
  // whether the loop is done, and `continue()` drives it until it is.
  describe("stepping", () => {
    it("reports not-done while there is still work to do", () => {
      const { game } = createGame();
      game.start();
      expect(game.step()).toBe(false);
    });

    it("reports done once it reaches a stopping point", () => {
      const { game } = createGame();
      game.start();
      game.step();
      expect(game.step()).toBe(true);
    });

    it("advances the story when driven to its next stop", () => {
      const { game } = createGame();
      game.start();
      let guard = 0;
      while (!game.step() && guard < 50) {
        guard += 1;
      }
      expect(game.story.currentText).toBe("Second beat.\n");
    });

    // Part-way through, the story is a work in progress and reading its text
    // throws. That's transient rather than corruption -- driving the loop to
    // its next stop resolves it. Worth pinning: a regression that left the
    // story permanently unreadable would look identical at the call site.
    it("recovers from a partially stepped story", () => {
      const { game } = createGame();
      game.start();
      game.step();
      expect(() => game.story.currentText).toThrow();

      game.continue();
      expect(game.story.currentText).toBe("Second beat.\n");
    });

    it("recovers when the player advances after a partial step", () => {
      const { game } = createGame();
      game.start();
      game.step();
      game.clickedToContinue();
      expect(game.story.currentText).toBe("Second beat.\n");
    });
  });

  describe("continue", () => {
    // Each frame reports only what it just executed, so the host can highlight
    // the current line rather than every line ever run.
    it("reports only the paths executed in the latest frame", () => {
      const { game } = createGame();
      game.start();
      const first = Array.from(game.runtimeState.pathsExecutedThisFrame);

      game.clickedToContinue();
      const second = Array.from(game.runtimeState.pathsExecutedThisFrame);

      expect(first.length).toBeGreaterThan(0);
      expect(second.length).toBeGreaterThan(0);
      expect(second).not.toEqual(first);
      // Not accumulated across frames
      expect(second.some((p) => first.includes(p))).toBe(false);
    });

    it("keeps the execution info when asked to preserve it", () => {
      const { game } = createGame();
      game.start();
      const before = Array.from(game.runtimeState.pathsExecutedThisFrame);
      game.continue(true);
      const after = Array.from(game.runtimeState.pathsExecutedThisFrame);
      expect(after).toEqual(expect.arrayContaining(before));
    });
  });

  describe("execution budget", () => {
    // The guard exists so a runaway script reports an error instead of
    // hanging the host. It is counted in work rather than elapsed time, so the
    // test names a tiny budget instead of driving a clock -- and so a slow
    // machine cannot turn a long scene into a reported infinite loop.
    it("reports a runtime error instead of looping forever", () => {
      const { game, emitted } = createGame({ executionStepLimit: 1 });
      game.start();

      const error = emitted.find((e) => e.method === "game/runtimeError");
      expect(error?.params?.["message"]).toBe(
        "Execution exceeded 1 step: possible infinite loop",
      );
    });

    it("does not fire the guard on a normal script", () => {
      const { game, emitted } = createGame();
      game.start();
      game.clickedToContinue();
      expect(emitted.some((e) => e.method === "game/runtimeError")).toBe(false);
    });
  });
});
