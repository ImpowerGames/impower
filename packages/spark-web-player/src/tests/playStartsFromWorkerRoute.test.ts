// Pressing PLAY has to put the game at the line the cursor is on, and getting
// there means finding a replay of the story that reaches it. That search is
// expensive — on a story it never reaches it runs until a work ceiling stops
// it — and `startGameAndApp` runs on the thread that paints the player, so a
// search there freezes the whole page for as long as it lasts (#385).
//
// The compiler worker already performs that identical search, on every compile
// and every cursor move, and reports the paths it reached a definite answer
// about: the story state at that path, or, with no state, that no route to it
// exists. These tests pin the play path to that answer — when it covers the
// start point this run begins from, PLAY must not search again — and to the
// fallback, which must survive intact for every case the answer does not
// cover.

import { describe, expect, test } from "vitest";
import { GamePlayerController } from "../GamePlayerController";
import { programIdentity } from "../utils/programIdentity";

const PROGRAM = {
  uri: "file://proj/main.sd",
  version: 3,
  // `hasCompiledProgram` only looks for one of these, and the play path gates
  // starting the app on it.
  compiled: {},
  pathLocations: {},
  scripts: { "file://proj/main.sd": 3 },
} as any;

/** A save of the shape a route replay produces: `simulatedFrom` is what makes
 *  the real `Game.load` mark the simulation successful. `label` is only here so
 *  the test can say which save was loaded. */
const SIMULATED_SAVE = JSON.stringify({
  label: "the state at main.3",
  simulatedFrom: "main",
  modules: {},
  context: {},
  story: "{}",
  runtime: "{}",
});

/** A save that will not parse, as a truncated or corrupted one would not. */
const TRUNCATED_SAVE = '{"simulatedFrom":"main","stor';

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
    // `programIdentity` reads these; `version` is deliberately not part of it.
    program: { uri: PROGRAM.uri, scripts: PROGRAM.scripts, version: 99 },
    simulate: () => {
      calls.push("simulate");
    },
    // Mirrors the real `Game.load`: parse the save, and only report success
    // when it is a simulated one (the real method keys that off `simulatedFrom`,
    // which every checkpoint captured during a route replay carries). A save
    // that will not parse returns false and leaves the simulation unmarked.
    load: (checkpoint: string) => {
      try {
        const save = JSON.parse(checkpoint);
        calls.push(`load:${save.label}`);
        if (save.simulatedFrom) {
          game.simulation = "success";
        }
        return true;
      } catch {
        calls.push("load-failed");
        return false;
      }
    },
    start: () => {
      calls.push("start");
    },
  };
  return game;
}

/** The identity the worker reports when it searched against the same program
 *  the player is holding. */
const MATCHING_PROGRAM_ID = programIdentity(PROGRAM);

/** A controller wired to the recording game, with the two heavy build steps
 *  (the real Game and the pixi Application) stubbed out. */
function playControllerWith(
  game: any,
  worker: {
    checkpoint?: string;
    simulatedPath?: string | null;
    simulatedProgramId?: string;
  },
) {
  const controller: any = new GamePlayerController(
    document.createElement("div"),
    {} as any,
  );
  controller._program = PROGRAM;
  controller._checkpoint = worker.checkpoint;
  controller._simulatedPath = worker.simulatedPath;
  controller._simulatedProgramId =
    "simulatedProgramId" in worker
      ? worker.simulatedProgramId
      : MATCHING_PROGRAM_ID;
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
      checkpoint: SIMULATED_SAVE,
    });

    await controller.startGameAndApp();

    expect(game.calls).toContain("load:the state at main.3");
    // The whole point: no route search on the thread that paints the player.
    expect(game.calls).not.toContain("simulate");
    // And the game is left in the state `start` resumes from. `start` reads
    // that state when it is called, so the load has to come first — an
    // ordering swap would leave the run resuming from nothing.
    expect(game.simulation).toBe("success");
    expect(game.calls.indexOf("load:the state at main.3")).toBeLessThan(
      game.calls.indexOf("start"),
    );
  });

  test("a start point with no route is not searched for again", async () => {
    // A named path with no state means the worker established that no route
    // reaches it. Running the same doomed search on the interface thread would
    // freeze the page for seconds and reach the same verdict.
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
    const controller = playControllerWith(game, {
      simulatedPath: "main.3",
      checkpoint: TRUNCATED_SAVE,
    });

    await controller.startGameAndApp();

    expect(game.calls).toContain("load-failed");
    expect(game.calls).toContain("simulate");
  });

  test("a checkpoint for a different start point is not loaded", async () => {
    // The worker's answer describes the path it searched for. If this run
    // begins somewhere else, loading that checkpoint would drop the player
    // into an unrelated part of the story, so the search has to happen here.
    const game = recordingGame("main.3");
    const controller = playControllerWith(game, {
      simulatedPath: "other.7",
      checkpoint: SIMULATED_SAVE,
    });

    await controller.startGameAndApp();

    expect(game.calls.some((c: string) => c.startsWith("load:"))).toBe(false);
    expect(game.calls).toContain("simulate");
  });

  test("an answer about a different version of the script is not used", async () => {
    // Pressing PLAY between a cursor move and the compile behind it can leave
    // the worker an edit ahead of the program this game was built from. The
    // path would still match — a path string survives an edit — so the program
    // identity is what catches it. Falling back to searching here is the old
    // behaviour: slower, but it cannot start the game in the wrong place.
    const game = recordingGame("main.3");
    const controller = playControllerWith(game, {
      simulatedPath: "main.3",
      checkpoint: SIMULATED_SAVE,
      simulatedProgramId: programIdentity({
        uri: PROGRAM.uri,
        scripts: { [PROGRAM.uri]: 4 },
      }),
    });

    await controller.startGameAndApp();

    expect(game.calls.some((c: string) => c.startsWith("load:"))).toBe(false);
    expect(game.calls).toContain("simulate");
  });

  test("an answer with no program identity at all is not used", async () => {
    // The identity is required, not optional: without it there is no way to
    // know the answer is about this script, so the safe reading is that it is
    // not. Failing this way costs a search; failing the other way starts the
    // game somewhere the user did not ask for.
    const game = recordingGame("main.3");
    const controller = playControllerWith(game, {
      simulatedPath: "main.3",
      checkpoint: SIMULATED_SAVE,
      simulatedProgramId: undefined,
    });

    await controller.startGameAndApp();

    expect(game.calls.some((c: string) => c.startsWith("load:"))).toBe(false);
    expect(game.calls).toContain("simulate");
  });

  test("with no worker answer at all, the play path still searches", async () => {
    // A host that never simulates routes off the main thread must keep
    // working; the fallback is the old behaviour, unchanged.
    const game = recordingGame("main.3");
    const controller = playControllerWith(game, {
      simulatedPath: undefined,
      checkpoint: undefined,
      simulatedProgramId: undefined,
    });

    await controller.startGameAndApp();

    expect(game.calls).toContain("simulate");
    // Same ordering requirement as the reuse path.
    expect(game.calls.indexOf("simulate")).toBeLessThan(
      game.calls.indexOf("start"),
    );
  });

  test("a game that resolves no start path still searches", async () => {
    // Nothing to match against, so the reuse rule must not fire on two
    // undefineds and silently skip the (cheap, immediately-returning) search.
    const game = recordingGame(null);
    const controller = playControllerWith(game, {
      simulatedPath: undefined,
      checkpoint: undefined,
      simulatedProgramId: undefined,
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
        checkpoint: SIMULATED_SAVE,
        simulatedPath: "main.3",
      },
    });

    expect(controller._checkpoint).toBe(SIMULATED_SAVE);
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
