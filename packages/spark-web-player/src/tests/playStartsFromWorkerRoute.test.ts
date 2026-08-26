// Pressing PLAY has to put the game at the line the cursor is on, and getting
// there means finding a replay of the story that reaches it. That search is
// expensive — on a story it never reaches it runs until a work ceiling stops
// it — and `startGameAndApp` runs on the thread that paints the player, so a
// search there freezes the whole page for as long as it lasts (#385).
//
// The compiler worker already performs that identical search, on every compile
// and every cursor move, and reports both the path it searched for and the
// story state it ended at. These tests pin the play path to that answer: when
// the worker already searched for the same start point, PLAY must not search
// again — whether the worker succeeded or failed.

import { describe, expect, test } from "vitest";
import { GamePlayerController } from "../GamePlayerController";

const PROGRAM = {
  uri: "file://proj/main.sd",
  version: 3,
  // `hasCompiledProgram` only looks for one of these, and the play path gates
  // starting the app on it.
  compiled: {},
  pathLocations: {},
  scripts: { "file://proj/main.sd": 3 },
} as any;

/** A stand-in game that records what the play path asks of it, and nothing
 *  else. `simulate` here is the interface-thread route search — the call this
 *  fix exists to avoid. */
function recordingGame(startPath: string | null) {
  const calls: string[] = [];
  const game: any = {
    calls,
    state: "initial",
    startPath,
    simulatePath: undefined as string | null | undefined,
    simulation: undefined as string | undefined,
    program: { uri: PROGRAM.uri, version: PROGRAM.version },
    simulate: () => {
      calls.push("simulate");
    },
    load: (checkpoint: string) => {
      calls.push(`load:${checkpoint}`);
      // A real `load` of a simulated checkpoint marks the simulation
      // successful, which is what lets `start` resume at the destination.
      game.simulation = "success";
      return true;
    },
    start: () => {
      calls.push("start");
    },
  };
  return game;
}

/** A controller wired to the recording game, with the two heavy build steps
 *  (the real Game and the pixi Application) stubbed out. */
function playControllerWith(
  game: any,
  worker: { checkpoint?: string; simulatedPath?: string | null },
) {
  const controller: any = new GamePlayerController(
    document.createElement("div"),
    {} as any,
  );
  controller._program = PROGRAM;
  controller._checkpoint = worker.checkpoint;
  controller._simulatedPath = worker.simulatedPath;
  controller.buildGame = async () => game;
  controller.buildApp = async () => ({
    start: () => game.calls.push("app-start"),
  });
  controller.listen = () => {};
  return controller;
}

describe("pressing play reuses the compiler worker's route search", () => {
  test("the worker's checkpoint is loaded instead of searching again", async () => {
    const game = recordingGame("main.3");
    const controller = playControllerWith(game, {
      simulatedPath: "main.3",
      checkpoint: "CHECKPOINT",
    });

    await controller.startGameAndApp();

    expect(game.calls).toContain("load:CHECKPOINT");
    // The whole point: no route search on the thread that paints the player.
    expect(game.calls).not.toContain("simulate");
    // And the game is left in the state `start` resumes from.
    expect(game.simulation).toBe("success");
  });

  test("a search the worker already failed is not repeated", async () => {
    // The worker reports the path it searched for even when it found nothing,
    // so an absent checkpoint here means "searched and failed", not "never
    // tried". Running the same doomed search on the interface thread would
    // freeze the page for seconds and then fail identically.
    const game = recordingGame("main.3");
    const controller = playControllerWith(game, {
      simulatedPath: "main.3",
      checkpoint: undefined,
    });

    await controller.startGameAndApp();

    expect(game.calls).not.toContain("simulate");
    expect(game.calls.some((c: string) => c.startsWith("load:"))).toBe(false);
    // The failure is still recorded, so the toolbar reports an unreachable
    // start point and `start` falls back to jumping straight to it.
    expect(game.simulation).toBe("fail");
    expect(game.simulatePath).toBe("main");
    // The game is still started — a failed route means starting at the top of
    // the containing knot, not refusing to play.
    expect(game.calls).toContain("start");
  });

  test("a checkpoint that will not load falls back to searching here", async () => {
    // A malformed save is not the runaway case: the worker reaching this start
    // point proves a route exists, so the search run here finds one and ends.
    // Starting at the wrong place would be the worse outcome.
    const game = recordingGame("main.3");
    game.load = (checkpoint: string) => {
      game.calls.push(`load-failed:${checkpoint}`);
      return false;
    };
    const controller = playControllerWith(game, {
      simulatedPath: "main.3",
      checkpoint: "TRUNCATED",
    });

    await controller.startGameAndApp();

    expect(game.calls).toContain("load-failed:TRUNCATED");
    expect(game.calls).toContain("simulate");
  });

  test("a checkpoint for a different start point is not loaded", async () => {
    // The worker's answer describes the path it searched for. If this run
    // begins somewhere else, loading that checkpoint would drop the player
    // into an unrelated part of the story, so the search has to happen here.
    const game = recordingGame("main.3");
    const controller = playControllerWith(game, {
      simulatedPath: "other.7",
      checkpoint: "WRONG_PLACE",
    });

    await controller.startGameAndApp();

    expect(game.calls).not.toContain("load:WRONG_PLACE");
    expect(game.calls).toContain("simulate");
  });

  test("with no worker answer at all, the play path still searches", async () => {
    // A host that never simulates routes off the main thread must keep
    // working; the fallback is the old behaviour, unchanged.
    const game = recordingGame("main.3");
    const controller = playControllerWith(game, {
      simulatedPath: undefined,
      checkpoint: undefined,
    });

    await controller.startGameAndApp();

    expect(game.calls).toContain("simulate");
  });

  test("a game that resolves no start path still searches", async () => {
    // Nothing to match against, so the reuse rule must not fire on two
    // undefineds and silently skip the (cheap, immediately-returning) search.
    const game = recordingGame(null);
    const controller = playControllerWith(game, {
      simulatedPath: undefined,
      checkpoint: undefined,
    });

    await controller.startGameAndApp();

    expect(game.calls).toContain("simulate");
  });
});

describe("the worker's route answer reaches the play path", () => {
  test("a compile stores both the checkpoint and the path it was found for", async () => {
    const controller: any = new GamePlayerController(
      document.createElement("div"),
      {} as any,
    );

    await controller.handleCompiledProgram({
      method: "compiler/didCompile",
      params: {
        textDocument: { uri: PROGRAM.uri, version: 3 },
        program: PROGRAM,
        checkpoint: "CHECKPOINT",
        simulatedPath: "main.3",
      },
    });

    expect(controller._checkpoint).toBe("CHECKPOINT");
    expect(controller._simulatedPath).toBe("main.3");
  });

  test("a cursor move stores the path even when no route was found", async () => {
    // `_program` is left unset so the handler stops after recording the
    // worker's answer instead of walking into the preview path.
    const controller: any = new GamePlayerController(
      document.createElement("div"),
      {} as any,
    );

    await controller.handleSelectedCompilerDocument({
      method: "compiler/didSelect",
      params: {
        textDocument: { uri: PROGRAM.uri },
        selectedRange: {
          start: { line: 12, character: 0 },
          end: { line: 12, character: 0 },
        },
        docChanged: false,
        userEvent: true,
        simulatedPath: "main.3",
      },
    });

    expect(controller._checkpoint).toBeUndefined();
    expect(controller._simulatedPath).toBe("main.3");
  });
});
