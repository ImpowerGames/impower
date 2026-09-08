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
  test("marks the path the remembered point resolves to now, not the one it resolved to before", async () => {
    // The cursor sits in a file the program does not know, so the controller
    // keeps the game's remembered point (main.sd line 4). The program has
    // changed since that point last resolved: the mark, and so the beat the
    // asset module centres its window on, must be the point's path in this
    // program, the one `preview()` will resolve, not the path it had before.
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.markPreviewing = (path: string) => calls.push(`markPreviewing:${path}`);
    const program = {
      ...PROGRAM,
      pathLocations: { "1.0": [0, 4, 0, 4, 5] },
    };
    await controllerWith(game, stubApp(calls)).updatePreview(
      program,
      "file://proj/other.sd",
      1,
      "SAVE",
    );
    expect(calls).toContain("markPreviewing:1.0");
    expect(calls).not.toContain("markPreviewing:0.0");
  });

  test("marks nothing for a remembered point that no longer resolves, and still previews", async () => {
    // The remembered point's script is gone from the program (renamed, or
    // deleted), so no path resolves for it now, and the cursor sits in a
    // file the program does not know either; the point's old path must not
    // be marked, or the connect would run a beat the preview cannot display.
    // The preview still happens, so the game can reveal what it has.
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.markPreviewing = (path: string) => calls.push(`markPreviewing:${path}`);
    const program = {
      ...PROGRAM,
      pathLocations: { "0.0": [0, 4, 0, 4, 5] },
      scripts: { "file://proj/other.sd": {} },
    };
    await controllerWith(game, stubApp(calls)).updatePreview(
      program,
      "file://proj/third.sd",
      1,
      "SAVE",
    );
    expect(calls).toContain("markPreviewing:undefined");
    expect(calls).not.toContain("markPreviewing:0.0");
    expect(calls).toContain("preview");
  });

  test("marks the game's own path for the remembered point while the program stands", async () => {
    // The cursor sits on a line that resolves to nothing and nothing was
    // recompiled: the remembered point's path is the one the game resolved
    // for it, and it is marked without resolving the point again.
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.markPreviewing = (path: string) => calls.push(`markPreviewing:${path}`);
    game.program = { uri: PROGRAM.uri, version: PROGRAM.version };
    await controllerWith(game, stubApp(calls)).updatePreview(
      PROGRAM,
      PROGRAM.uri,
      9,
      "SAVE",
    );
    expect(calls).toContain("markPreviewing:0.0");
  });

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

  test("the elements the last preview left are not swept until the preview has settled", async () => {
    // The preview waits for the beat's pictures before it writes the beat;
    // a sweep before that would take the previous preview's elements away
    // and then the beat's writes with them (#429).
    const calls: string[] = [];
    let settlePreview = (_path: string | null) => {};
    const game = recordingGame(calls);
    game.preview = () => {
      calls.push("preview");
      return new Promise<string | null>((resolve) => {
        settlePreview = resolve;
      });
    };
    const controller = controllerWith(game, stubApp(calls));
    const updating = controller.updatePreview(PROGRAM, PROGRAM.uri, 4, "SAVE");
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(calls).toContain("preview");
    expect(calls).not.toContain("sweepReconcile");
    settlePreview("0.0");
    await updating;
    expect(calls.indexOf("preview")).toBeLessThan(
      calls.indexOf("sweepReconcile"),
    );
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

  test("a preview update another overtakes while it waits does not sweep the newer update's pass", async () => {
    // Each update's reconcile pass adopts the screen, and its sweep removes
    // what the update did not re-emit. When a second update starts while
    // the first waits for its preview, the second's pass owns the screen: a
    // sweep by the first would take the second beat's content off it before
    // that beat is written, and leave the second's own sweep nothing to
    // remove.
    const calls: string[] = [];
    const settles: Array<(path: string | null) => void> = [];
    const game = recordingGame(calls);
    game.preview = () => {
      calls.push(`preview:${settles.length + 1}`);
      return new Promise<string | null>((resolve) => {
        settles.push(resolve);
      });
    };
    const controller = controllerWith(game, stubApp(calls));
    const first = controller.updatePreview(PROGRAM, PROGRAM.uri, 4, "SAVE");
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    const second = controller.updatePreview(PROGRAM, PROGRAM.uri, 6, "SAVE");
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(calls.filter((c) => c.startsWith("preview:"))).toEqual([
      "preview:1",
      "preview:2",
    ]);
    // The engine lets the first preview go when the second starts.
    settles[0]!(null);
    await first;
    expect(calls).not.toContain("sweepReconcile");
    settles[1]!("0.0");
    await second;
    expect(calls.filter((c) => c === "sweepReconcile")).toHaveLength(1);
    expect(calls.indexOf("preview:2")).toBeLessThan(
      calls.indexOf("sweepReconcile"),
    );
  });

  test("a preview update whose game the play path replaced while it waited does not sweep", async () => {
    // PLAY builds a new game and application over the same overlay; the
    // sweep belongs to an update of the game that owns the screen, not to
    // one whose preview the replaced game let go of.
    const calls: string[] = [];
    let settlePreview = (_path: string | null) => {};
    const game = recordingGame(calls);
    game.preview = () => {
      calls.push("preview");
      return new Promise<string | null>((resolve) => {
        settlePreview = resolve;
      });
    };
    const controller = controllerWith(game, stubApp(calls));
    const updating = controller.updatePreview(PROGRAM, PROGRAM.uri, 4, "SAVE");
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(calls).toContain("preview");
    (controller as any)._game = recordingGame([], "running");
    settlePreview(null);
    await updating;
    expect(calls).not.toContain("sweepReconcile");
  });

  test("an update overtaken while it waits for the connect neither previews nor sweeps", async () => {
    // The older update is suspended inside the connect when the newer one
    // arrives and runs to completion; released, it must not preview its
    // own point over the newer one's, nor sweep.
    const calls: string[] = [];
    let releaseConnect = () => {};
    let connects = 0;
    const app = stubApp(calls);
    app.connectGame = () => {
      calls.push("connectGame");
      connects += 1;
      if (connects === 1) {
        return new Promise<void>((resolve) => {
          releaseConnect = resolve;
        });
      }
      return Promise.resolve();
    };
    const controller = controllerWith(recordingGame(calls), app);
    const first = controller.updatePreview(PROGRAM, PROGRAM.uri, 4, "SAVE");
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    await controller.updatePreview(PROGRAM, PROGRAM.uri, 6, "SAVE");
    expect(calls.filter((c) => c === "preview")).toHaveLength(1);
    expect(calls.filter((c) => c === "sweepReconcile")).toHaveLength(1);
    releaseConnect();
    await first;
    expect(calls.filter((c) => c === "preview")).toHaveLength(1);
    expect(calls.filter((c) => c === "sweepReconcile")).toHaveLength(1);
  });
});
