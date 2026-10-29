import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { afterEach, describe, expect, test } from "vitest";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";
import { displayPreviewFrom } from "../main/workers/displayPreviewFrom";

const PROGRAM = {
  uri: "file://proj/main.sd",
  version: 2,
  scripts: { "file://proj/main.sd": {} },
} as any;

function compiledProgram(uri: string, text: string, version: number) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri, type: "script", name: "main", ext: "sd", text, version, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri } }).program;
  expect(program.chunks).toBeTruthy();
  return { ...program, version } as any;
}

function recordingGame(calls: string[], state = "previewing") {
  return {
    state,
    program: { uri: PROGRAM.uri, version: 1 },
    previewAddress: 0,
    previewFrom: { file: PROGRAM.uri, line: 4 },
    previewedAddress: undefined as number | undefined,
    routeStartOf: (_address: number) => "0",
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
      return 0;
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
    expect(calls.indexOf("connectGame")).toBeLessThan(calls.indexOf("preview"));
  });

  test("the previous preview's images are forgotten before the connect", async () => {
    const calls: string[] = [];
    await displayIn(recordingGame(calls), stubApp(calls)).display(PROGRAM, PROGRAM.uri, 4);

    expect(calls).toContain("forgetDisplayedImages");
    expect(calls.indexOf("forgetDisplayedImages")).toBeLessThan(calls.indexOf("connectGame"));
  });

  test("a repeated path still waits for the engine's pending image gate", async () => {
    const game = recordingGame([]);
    game.program = PROGRAM;
    game.previewedAddress = 0;
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
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.markPreviewing = (address: number) => calls.push(`markPreviewing:${address}`);
    const program = compiledProgram(
      PROGRAM.uri,
      ["Line zero.", "Line one.", "Line two.", "Line three.", "Line four.", ""].join("\n"),
      PROGRAM.version,
    );
    const locator = programLocator(program);
    const now = locator.addressAt(PROGRAM.uri, 4, { beat: "last" });
    const before = locator.addressAt(PROGRAM.uri, 1, { beat: "last" });
    expect(now != null && before != null && now !== before).toBe(true);
    game.previewAddress = before;
    await displayIn(game, stubApp(calls)).display(program, "file://proj/other.sd", 1);
    expect(calls).toContain(`markPreviewing:${now}`);
    expect(calls).not.toContain(`markPreviewing:${before}`);
  });

  test("marks nothing for a remembered point that no longer resolves, and still previews", async () => {
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.markPreviewing = (address: number) => calls.push(`markPreviewing:${address}`);
    const program = compiledProgram(
      "file://proj/other.sd",
      ["Line zero.", "Line one.", "Line two.", "Line three.", "Line four.", ""].join("\n"),
      PROGRAM.version,
    );
    expect(Object.keys(program.scripts)).toEqual(["file://proj/other.sd"]);
    await displayIn(game, stubApp(calls)).display(program, "file://proj/third.sd", 1);
    expect(calls).toContain("markPreviewing:undefined");
    expect(calls).not.toContain("markPreviewing:0");
    expect(calls).toContain("preview");
  });

  test("marks the game's own path for the remembered point while the program stands", async () => {
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.markPreviewing = (address: number) => calls.push(`markPreviewing:${address}`);
    game.program = { uri: PROGRAM.uri, version: PROGRAM.version };
    await displayIn(game, stubApp(calls)).display(PROGRAM, PROGRAM.uri, 9);
    expect(calls).toContain("markPreviewing:0");
  });

  test("the game leaves the editors' part out of its report while it shows a suggestion, and puts it back for the document", async () => {
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
    const calls: string[] = [];
    const game = recordingGame(calls);
    game.previewAddress = undefined;
    game.previewedAddress = undefined;
    game.program = { uri: PROGRAM.uri, version: PROGRAM.version };
    await displayIn(game, stubApp(calls)).display(PROGRAM, PROGRAM.uri, 4);
    expect(calls).toContain("connectGame");
  });

  test("the elements the last preview left are not swept until the preview has settled", async () => {
    const calls: string[] = [];
    let settlePreview = (_address: number | null) => {};
    const game = recordingGame(calls);
    game.preview = () => {
      calls.push("preview");
      return new Promise<number | null>((resolve) => {
        settlePreview = resolve;
      });
    };
    const updating = displayIn(game, stubApp(calls)).display(PROGRAM, PROGRAM.uri, 4);
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(calls).toContain("preview");
    expect(calls).not.toContain("sweepReconcile");
    settlePreview(0);
    await updating;
    expect(calls.indexOf("preview")).toBeLessThan(calls.indexOf("sweepReconcile"));
  });

  test("the preview is not written until the connect has settled", async () => {
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
    const calls: string[] = [];
    const settles: Array<(address: number | null) => void> = [];
    const game = recordingGame(calls);
    game.preview = () => {
      calls.push(`preview:${settles.length + 1}`);
      return new Promise<number | null>((resolve) => {
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
    settles[0]!(null);
    await first;
    expect(calls).not.toContain("sweepReconcile");
    settles[1]!(0);
    await second;
    expect(calls.filter((c) => c === "sweepReconcile")).toHaveLength(1);
    expect(calls.indexOf("preview:2")).toBeLessThan(calls.indexOf("sweepReconcile"));
  });

  test("a display overtaken while it waits for the connect neither previews nor sweeps", async () => {
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
    const program = { ...PROGRAM, files: {}, summary: true, runnable: true };
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
