// The order `updatePreview` performs its steps in is the whole preview-audio
// fix, and it is invisible from inside the engine.
//
// Connecting the game restores every module, and the audio module decides there
// whether to resume the music the route left playing. It makes that decision
// from `context.system.previewing`, so the mode has to be declared BEFORE the
// checkpoint load and the connect — not by `preview()`, which runs last.
//
// The controller's constructor only stores its host and refs (`setup()` is what
// attaches listeners), so it can be driven directly with a recording stand-in
// for the game.

import { describe, expect, test } from "vitest";
import { GamePlayerController } from "../GamePlayerController";

const PROGRAM = {
  uri: "file://proj/main.sd",
  version: 2,
  pathLocations: {},
  scripts: { "file://proj/main.sd": {} },
} as any;

/** A game that records the order it is called in, and nothing else. */
function recordingGame(calls: string[], state = "previewing") {
  return {
    state,
    program: { uri: PROGRAM.uri, version: 1 },
    // No path resolves from the empty `pathLocations`, so the controller falls
    // back to the game's remembered preview point — which is what a real one
    // does between edits.
    previewPath: "0.0",
    previewFrom: { file: PROGRAM.uri, line: 4 },
    previewedPath: undefined as string | undefined,
    updateProgram: () => calls.push("updateProgram"),
    markPreviewing: () => calls.push("markPreviewing"),
    module: {
      ui: { forgetDisplayedImages: () => calls.push("forgetDisplayedImages") },
    },
    load: () => calls.push("load"),
    preview: () => {
      calls.push("preview");
      return "0.0";
    },
  } as any;
}

function stubApp(calls: string[]) {
  return {
    ui: {
      beginReconcilePass: () => calls.push("beginReconcilePass"),
      sweepReconcile: () => calls.push("sweepReconcile"),
    },
    connectGame: async () => {
      calls.push("connectGame");
    },
  } as any;
}

function controllerWith(game: any, app: any) {
  const controller = new GamePlayerController(
    document.createElement("div"),
    {} as any,
  );
  (controller as any)._game = game;
  (controller as any)._app = app;
  (controller as any)._program = PROGRAM;
  return controller;
}

describe("preview session ordering", () => {
  test("the game is told it is previewing before the load and the connect", async () => {
    const calls: string[] = [];
    const controller = controllerWith(recordingGame(calls), stubApp(calls));

    await controller.updatePreview(PROGRAM, PROGRAM.uri, 4, "SAVE");

    expect(calls).toContain("markPreviewing");
    expect(calls.indexOf("markPreviewing")).toBeLessThan(
      calls.indexOf("load"),
    );
    expect(calls.indexOf("markPreviewing")).toBeLessThan(
      calls.indexOf("connectGame"),
    );
    // And `preview()` still runs last — it is what picks the point to show.
    expect(calls.indexOf("connectGame")).toBeLessThan(calls.indexOf("preview"));
  });

  test("the previous preview's images are forgotten before the connect", async () => {
    // Restore runs inside the connect and re-applies whatever the module still
    // believes is displayed, so the record has to be dropped before then or the
    // last preview's backdrop comes back up behind the new point.
    const calls: string[] = [];
    const controller = controllerWith(recordingGame(calls), stubApp(calls));

    await controller.updatePreview(PROGRAM, PROGRAM.uri, 4, "SAVE");

    expect(calls).toContain("forgetDisplayedImages");
    expect(calls.indexOf("forgetDisplayedImages")).toBeLessThan(
      calls.indexOf("connectGame"),
    );
  });

  test("a game the play path is still building is left alone", async () => {
    // `startGameAndApp` publishes its game in `initial` state and awaits
    // `buildApp` before calling `start()`. A compile landing in that window
    // reaches here holding the game that is about to run for real, and marking
    // it previewing would cost that run its renderer.
    const calls: string[] = [];
    const controller = controllerWith(
      recordingGame(calls, "initial"),
      stubApp(calls),
    );

    await controller.updatePreview(PROGRAM, PROGRAM.uri, 4, "SAVE");

    expect(calls).not.toContain("markPreviewing");
  });

  test("a project that resolves no path still reconnects on every selection", async () => {
    // A UI-only project has no narrative path, so the remembered preview path
    // stays undefined. Treating that as "already previewed this path" would
    // skip the reconnect and freeze its bindings.
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.previewPath = undefined;
    game.previewedPath = undefined;
    game.program = { uri: PROGRAM.uri, version: PROGRAM.version };

    await controllerWith(game, stubApp(calls)).updatePreview(
      PROGRAM,
      PROGRAM.uri,
      4,
      "SAVE",
    );

    expect(calls).toContain("connectGame");
  });

  test("the preview is not written until the connect has settled", async () => {
    // The connect holds the restore gate: the pictures the checkpoint shows
    // and the beat under the cursor is about to show. `preview()` writes
    // that beat synchronously, so it has to wait for the connect to resolve,
    // not merely to have been called (#429).
    const calls: string[] = [];
    let settleConnect = () => {};
    const app = stubApp(calls);
    app.connectGame = () => {
      calls.push("connectGame");
      return new Promise<void>((resolve) => {
        settleConnect = resolve;
      });
    };
    const controller = controllerWith(recordingGame(calls), app);

    const updating = controller.updatePreview(PROGRAM, PROGRAM.uri, 4, "SAVE");
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(calls).toContain("connectGame");
    expect(calls).not.toContain("preview");
    settleConnect();
    await updating;
    expect(calls.indexOf("connectGame")).toBeLessThan(calls.indexOf("preview"));
  });
});
