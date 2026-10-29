import { beforeAll, describe, expect, it } from "vitest";
import { compileProgram } from "../../../tests/harness/compileProgram";
import { Game } from "./Game";

const THREE_BEATS = ["First beat.", "Second beat.", "Third beat.", ""].join(
  "\n",
);

const compile = (source: string) => compileProgram(source);

let program: ReturnType<typeof compileProgram>;

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
      method: (message as unknown as Recorded).method,
      params: (message as unknown as Recorded).params,
    });
  });

  return {
    game,
    emitted,
    gameMethods: () =>
      emitted.map((e) => e.method).filter((m) => m.startsWith("game/")),
    clear: () => {
      emitted.length = 0;
    },
  };
};

describe("Game flow on the program engine", () => {
  beforeAll(() => {
    program = compile(THREE_BEATS);
  });

  it("compiles the fixture without diagnostics", () => {
    expect(program.diagnostics ?? {}).toEqual({});
    expect(program.chunks).toBeDefined();
    expect(program.chunks).toBeTruthy();
  });

  it("runs on the program engine", () => {
    const { game } = createGame();
    expect(game.programStory !== null).toBe(true);
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

    it("reports which lines it executed", () => {
      const { game, emitted } = createGame();
      game.start();
      const executed = emitted.find((e) => e.method === "game/executed");
      expect(executed?.params?.["state"]).toBe("running");
      expect(executed?.params?.["executedLines"]).toEqual({
        "inmemory:///main.sd": { ranges: [0, 0], last: 0 },
      });
      expect(executed?.params?.["lastExecutedAddress"]).toBeTruthy();
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
      game.clickedToContinue();
      expect(gameMethods()).not.toContain("game/awaitingInteraction");
    });

    it("reports that it finished once the script runs out", () => {
      const { game, gameMethods, clear } = createGame();
      game.start();
      game.clickedToContinue();
      game.clickedToContinue();
      clear();
      game.clickedToContinue();
      expect(gameMethods()).toContain("game/finished");
    });

    it("does not report finished while a beat is still waiting to be read", () => {
      const { game, gameMethods } = createGame();
      game.start();
      expect(gameMethods()).not.toContain("game/finished");

      game.clickedToContinue();
      expect(gameMethods()).not.toContain("game/finished");

      game.clickedToContinue();
      expect(game.story.currentText).toBe("Third beat.\n");
      expect(gameMethods()).not.toContain("game/finished");
    });

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

  describe("stepping", () => {
    it("reports not-done while there is still work to do", () => {
      const { game } = createGame();
      game.start();
      expect(game.step()).toBe(false);
    });

    it("reports done once it reaches a stopping point", () => {
      const { game } = createGame();
      game.start();
      let done = false;
      for (let guard = 0; guard < 50 && !done; guard += 1) {
        done = game.step();
      }
      expect(done).toBe(true);
      expect(game.story.currentText).toBe("Second beat.\n");
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
    it("reports only the paths executed in the latest frame", () => {
      const { game } = createGame();
      game.start();
      const first = Array.from(game.runtimeState.pathsExecutedThisFrame);

      game.clickedToContinue();
      const second = Array.from(game.runtimeState.pathsExecutedThisFrame);

      expect(first.length).toBeGreaterThan(0);
      expect(second.length).toBeGreaterThan(0);
      expect(second).not.toEqual(first);
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
