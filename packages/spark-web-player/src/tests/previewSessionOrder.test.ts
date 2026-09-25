// The order a display performs its steps in is the whole preview-audio fix,
// and it is invisible from inside the engine.
//
// Connecting the game restores every module, and the audio module decides there
// whether to resume the music the route left playing. It makes that decision
// from `context.system.previewing`, so the mode has to be declared BEFORE the
// checkpoint load and the connect — not by `preview()`, which runs last.
//
// The steps run on the worker's game (`displayPreviewFrom`), which is driven
// here with a recording stand-in, and the controller waits for the worker's
// answer. The controller's constructor only stores its host and refs
// (`setup()` is what attaches listeners), so it can be driven directly with a
// stand-in for its link to the worker.

import { pathLocationTableOf } from "@impower/sparkdown/src/compiler/utils/pathLocationTable";
import { afterEach, describe, expect, test } from "vitest";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";
import { displayPreviewFrom } from "../main/workers/displayPreviewFrom";

const PROGRAM = {
  uri: "file://proj/main.sd",
  version: 2,
  pathLocations: pathLocationTableOf({}),
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
    endSimulation: () => {},
    module: {
      ui: {
        forgetDisplayedImages: () => calls.push("forgetDisplayedImages"),
        sweepReconcile: () => calls.push("sweepReconcile"),
      },
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
    connectGame: async () => {
      calls.push("connectGame");
    },
  } as any;
}

function controllerWith(app: any) {
  const controller = new GamePlayerController(
    document.createElement("div"),
    {} as any,
  );
  (controller as any)._app = app;
  (controller as any)._program = PROGRAM;
  return controller;
}

/**
 * The display of `program` at `file`/`line` over `game`: the worker's
 * `displayPreviewFrom`, with the game connecting through a stand-in
 * application, so a test that holds the connect holds the display. Answers
 * whether the frame was completed.
 */
function displayIn(game: any, app: any) {
  const controller: any = controllerWith(app);
  let displays = 0;
  return {
    controller,
    display(
      program: any,
      file: string,
      line: number,
      options?: { speculative?: boolean },
    ): Promise<boolean> {
      const display = ++displays;
      game.connect = () => app.connectGame();
      const programChanged =
        game.program?.uri !== program.uri || game.program?.version !== program.version;
      if (programChanged) {
        game.updateProgram(program);
        game.program = program;
      }
      game.reportsExecutedLines = undefined;
      return displayPreviewFrom(game, {
        program,
        programChanged,
        file,
        line,
        speculative: Boolean(options?.speculative),
        checkpoint: "SAVE",
        send: () => {},
        superseded: () => display !== displays,
      });
    },
  };
}

describe("preview session ordering", () => {
  test("the game is told it is previewing before the load and the connect", async () => {
    const calls: string[] = [];
    await displayIn(recordingGame(calls), stubApp(calls)).display(PROGRAM, PROGRAM.uri, 4);

    expect(calls).toContain("markPreviewing");
    expect(calls.indexOf("markPreviewing")).toBeLessThan(calls.indexOf("load"));
    expect(calls.indexOf("markPreviewing")).toBeLessThan(calls.indexOf("connectGame"));
    // And `preview()` still runs last — it is what picks the point to show.
    expect(calls.indexOf("connectGame")).toBeLessThan(calls.indexOf("preview"));
  });

  test("the previous preview's images are forgotten before the connect", async () => {
    // Restore runs inside the connect and re-applies whatever the module
    // still believes is displayed, so the record has to be dropped before
    // then or the last preview's backdrop comes back up behind the new point.
    const calls: string[] = [];
    await displayIn(recordingGame(calls), stubApp(calls)).display(PROGRAM, PROGRAM.uri, 4);

    expect(calls).toContain("forgetDisplayedImages");
    expect(calls.indexOf("forgetDisplayedImages")).toBeLessThan(calls.indexOf("connectGame"));
  });

  test("a repeated path still waits for the engine's pending image gate", async () => {
    const game = recordingGame([]);
    game.program = PROGRAM;
    game.previewedPath = "0.0";
    let finish!: () => void;
    game.preview = () => new Promise<void>((resolve) => { finish = resolve; });
    let settled = false;
    const updating = displayIn(game, stubApp([]))
      .display(PROGRAM, PROGRAM.uri, 4)
      .then((done) => (settled = done));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(finish).toBeTypeOf("function");
    expect(settled).toBe(false);
    finish();
    await updating;
    expect(settled).toBe(true);
  });

  test("marks the path the remembered point resolves to now, not the one it resolved to before", async () => {
    // The cursor sits in a file the program does not know, so the display
    // keeps the game's remembered point (main.sd line 4). The program has
    // changed since that point last resolved: the mark, and so the beat the
    // asset module centres its window on, must be the point's path in this
    // program, the one `preview()` will resolve, not the path it had before.
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.markPreviewing = (path: string) => calls.push(`markPreviewing:${path}`);
    const program = {
      ...PROGRAM,
      pathLocations: pathLocationTableOf({ "1.0": [0, 4, 0, 4, 5] }),
    };
    await displayIn(game, stubApp(calls)).display(program, "file://proj/other.sd", 1);
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
      pathLocations: pathLocationTableOf({ "0.0": [0, 4, 0, 4, 5] }),
      scripts: { "file://proj/other.sd": {} },
    };
    await displayIn(game, stubApp(calls)).display(program, "file://proj/third.sd", 1);
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
    await displayIn(game, stubApp(calls)).display(PROGRAM, PROGRAM.uri, 9);
    expect(calls).toContain("markPreviewing:0.0");
  });

  test("the game leaves the editors' part out of its report while it shows a suggestion, and puts it back for the document", async () => {
    // The report of a suggestion is never relayed to the editor, so only its
    // first and last location, which label the preview, are worth taking.
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.updateProgram = (p: any) => (game.program = p);
    let reportsAtConnect: boolean | undefined;
    const app = stubApp(calls);
    app.connectGame = async () => {
      reportsAtConnect = game.reportsExecutedLines;
    };
    const displaying = displayIn(game, app);
    const suggestion = { ...PROGRAM, version: -1 };
    (displaying.controller as any)._completionProgramSet.add(suggestion);

    await displaying.display(suggestion, PROGRAM.uri, 4, { speculative: true });
    expect(reportsAtConnect).toBe(false);

    await displaying.display(PROGRAM, PROGRAM.uri, 4);
    expect(reportsAtConnect).toBe(true);
  });

  test("a project that resolves no path still reconnects on every selection", async () => {
    // A UI-only project has no narrative path, so the remembered preview
    // path stays undefined. Treating that as "already previewed this path"
    // would skip the reconnect and freeze its bindings.
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.previewPath = undefined;
    game.previewedPath = undefined;
    game.program = { uri: PROGRAM.uri, version: PROGRAM.version };
    await displayIn(game, stubApp(calls)).display(PROGRAM, PROGRAM.uri, 4);
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
    const updating = displayIn(game, stubApp(calls)).display(PROGRAM, PROGRAM.uri, 4);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(calls).toContain("preview");
    expect(calls).not.toContain("sweepReconcile");
    settlePreview("0.0");
    await updating;
    expect(calls.indexOf("preview")).toBeLessThan(calls.indexOf("sweepReconcile"));
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
    const updating = displayIn(recordingGame(calls), app).display(PROGRAM, PROGRAM.uri, 4);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(calls).toContain("connectGame");
    expect(calls).not.toContain("preview");
    settleConnect();
    await updating;
    expect(calls.indexOf("connectGame")).toBeLessThan(calls.indexOf("preview"));
  });

  test("a display another overtakes while it waits does not sweep the newer display's pass", async () => {
    // Each display's reconcile pass adopts the screen, and its sweep removes
    // what the display did not re-emit. When a second display starts while
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
    const displaying = displayIn(game, stubApp(calls));
    const first = displaying.display(PROGRAM, PROGRAM.uri, 4);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    const second = displaying.display(PROGRAM, PROGRAM.uri, 6);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(calls.filter((c) => c.startsWith("preview:"))).toEqual(["preview:1", "preview:2"]);
    // The engine lets the first preview go when the second starts.
    settles[0]!(null);
    await first;
    expect(calls).not.toContain("sweepReconcile");
    settles[1]!("0.0");
    await second;
    expect(calls.filter((c) => c === "sweepReconcile")).toHaveLength(1);
    expect(calls.indexOf("preview:2")).toBeLessThan(calls.indexOf("sweepReconcile"));
  });

  test("a display overtaken while it waits for the connect neither previews nor sweeps", async () => {
    // The older display is suspended inside the connect when the newer one
    // arrives and runs to completion; released, it must not preview its own
    // point over the newer one's, nor sweep.
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
    const displaying = displayIn(recordingGame(calls), app);
    const first = displaying.display(PROGRAM, PROGRAM.uri, 4);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    await displaying.display(PROGRAM, PROGRAM.uri, 6);
    expect(calls.filter((c) => c === "preview")).toHaveLength(1);
    expect(calls.filter((c) => c === "sweepReconcile")).toHaveLength(1);
    releaseConnect();
    await first;
    expect(calls.filter((c) => c === "preview")).toHaveLength(1);
    expect(calls.filter((c) => c === "sweepReconcile")).toHaveLength(1);
  });
});

describe("the controller's preview updates", () => {
  afterEach(() => setWorkspace(undefined as any));

  /**
   * A controller holding the program's summary, whose displays are
   * requests the test answers; `finishDisplay` settles the oldest one still
   * waiting.
   */
  function controllerIn(calls: string[], holdDisplays = false) {
    const waiting: ((result: { displayed: boolean }) => void)[] = [];
    setWorkspace({
      programHeld: async () => {},
      gameLink: {
        detach() {},
        request: () => {
          calls.push("preview");
          return holdDisplays
            ? new Promise((resolve) => waiting.push(resolve))
            : Promise.resolve({ displayed: true });
        },
      },
    } as any);
    const program = { ...PROGRAM, pathLocations: undefined, files: {}, summary: true, runnable: true };
    const controller: any = controllerWith(stubApp(calls));
    controller._program = program;
    controller._workerGame = { program };
    return {
      controller,
      program,
      finishDisplay: () => waiting.shift()?.({ displayed: true }),
    };
  }

  test("publishes the selected position only after a delayed preview settles", async () => {
    const calls: string[] = [];
    const { controller, finishDisplay } = controllerIn(calls, true);
    const states: any[] = [];
    controller.host.addEventListener("jsonrpc", (event: CustomEvent) => {
      if (event.detail.method === "preview/didChangeGameState") states.push(event.detail.params);
    });
    const updating = controller.handleSelectedCompilerDocument({ params: {
      textDocument: { uri: PROGRAM.uri }, selectedRange: { start: { line: 4 } },
      userEvent: true,
    } });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(calls).toContain("preview");
    expect(controller.getGameState().position).toBeNull();
    expect(states.every((state) => state.position === null)).toBe(true);
    finishDisplay();
    await updating;
    expect(states.at(-1).position).toEqual({ uri: PROGRAM.uri, line: 4 });
    await controller.handleRemovedCompilerFile({ params: { textDocument: { uri: PROGRAM.uri } } });
    expect(states.at(-1).position).toBeNull();
    expect(controller.getGameState().position).toBeNull();
  });

  test("a repeated selection invalidates its old completed position before the compiler replies", async () => {
    const { controller, program } = controllerIn([]);
    controller.registerProtocolHandlers();
    try {
      await controller.updatePreview(program, PROGRAM.uri, 4);
      expect(controller.getGameState().position).toEqual({ uri: PROGRAM.uri, line: 4 });
      window.dispatchEvent(new CustomEvent("jsonrpc", { detail: {
        jsonrpc: "2.0", method: "textDocument/didSelect", params: {
          textDocument: { uri: PROGRAM.uri }, selectedRange: { start: { line: 4 }, end: { line: 4 } }, userEvent: true, docChanged: false,
        },
      } }));
      expect(controller.getGameState().position).toBeNull();
    } finally { controller._protocols.dispose(); }
  });

  test("an update another overtakes while it waits publishes nothing for itself", async () => {
    const calls: string[] = [];
    const { controller, program, finishDisplay } = controllerIn(calls, true);
    const first = controller.updatePreview(program, PROGRAM.uri, 4);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const second = controller.updatePreview(program, PROGRAM.uri, 6);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    finishDisplay();
    expect(await first).toBe(false);
    finishDisplay();
    expect(await second).toBe(true);
    expect(controller.getGameState().position).toEqual({ uri: PROGRAM.uri, line: 6 });
  });
});
