// Previewing autocomplete suggestions (#634): which program the player shows
// while an author browses a suggestion list, and what reaches the screen.
//
// A suggestion is compiled as a hypothetical edit and shown in place of the
// real document until the list closes. An author holding an arrow key sends a
// request per key, so at most one suggestion is compiled at a time and only the
// newest waiting one is kept; anything answered after it stopped being wanted
// is dropped before it can touch the screen. The real document's program is
// never replaced by a suggestion's: it is what the list returns to on close,
// and what PLAY runs.
//
// The controller is driven with a stand-in workspace whose compiles resolve
// when the test says, and a recording `updatePreview`, since what is under test
// is which program is shown when, not how it is drawn. Like the real one, the
// stand-in hands the game its program as soon as it starts, can be held part
// way through drawing, and gives up when a newer draw starts or the one it was
// asked for stops being wanted.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { pathLocationTableOf } from "@impower/sparkdown/src/compiler/utils/pathLocationTable";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";

const URI = "file://proj/main.sd";
const LINE = 4;

/** The switch position the suites run in (#680). With the worker displaying
 *  the preview, the page holds each program's summary and the screen is the
 *  worker's game. */
const MODE = { worker: false };

const program = (name: string, version = 1, compiled: unknown = {}) =>
  (MODE.worker
    ? {
        uri: URI,
        version,
        files: {},
        scripts: { [URI]: version },
        summary: true,
        runnable: compiled != null,
        name,
      }
    : {
        uri: URI,
        version,
        compiled,
        pathLocations: pathLocationTableOf({}),
        scripts: { [URI]: version },
        name,
      }) as any;

const edit = (text: string) => [
  {
    range: { start: { line: LINE, character: 2 }, end: { line: LINE, character: 8 } },
    text,
  },
];

function harness() {
  const REAL = program("real");
  // What PLAY builds its game from: the real program, which with the worker
  // displaying the worker writes out whole for it.
  const playable = MODE.worker
    ? { uri: URI, version: 1, compiled: {}, scripts: { [URI]: 1 }, name: "real, whole" }
    : REAL;
  const compiles: {
    params: any;
    resolve: (result: any) => void;
  }[] = [];
  const workspace = {
    filesRevision: 0,
    previewCompile: (params: any) =>
      new Promise((resolve) => compiles.push({ params, resolve })),
    compileTextDocument: async () => {},
    workerDisplaysPreview: MODE.worker,
    gameLink: MODE.worker ? { detach() {}, addListener: () => () => {} } : undefined,
    programForPlay: async () => ({ program: playable, checkpoint: "REAL SAVE" }),
  };
  setWorkspace(workspace as any);
  const controller: any = new GamePlayerController(
    document.createElement("div"),
    {} as any,
  );
  controller._mounted = true;
  controller._program = REAL;
  controller._checkpoint = "REAL SAVE";
  controller._options = { startFrom: { file: URI, line: LINE } };
  if (MODE.worker) {
    controller._workerGame = { program: REAL };
  } else {
    controller._game = { state: "previewing", program: REAL };
  }
  // Every draw that finished, in order.
  const shown: { name: string; checkpoint?: string; speculative: boolean }[] = [];
  let draws = 0;
  let gate: Promise<void> | null = null;
  /** Hold every draw that starts from now on part way through, until the
   *  returned function is called. */
  const hold = () => {
    let release!: () => void;
    gate = new Promise<void>((resolve) => (release = resolve));
    return async () => {
      gate = null;
      release();
      await settle();
    };
  };
  controller.updatePreview = async (
    p: any,
    _file: string,
    _line: number,
    checkpoint: string | undefined,
    _failure: unknown,
    options?: { speculative?: boolean; current?: () => boolean },
  ) => {
    if (controller._game?.state === "running") return false;
    if (!options?.speculative) controller._completionShown = null;
    const draw = ++draws;
    (controller._game ?? controller._workerGame).program = p;
    if (gate) await gate;
    if (draw !== draws || options?.current?.() === false) return false;
    shown.push({ name: p.name, checkpoint, speculative: !!options?.speculative });
    return true;
  };
  let request = 0;
  const focus = (text: string | null, version = 1) =>
    controller.handlePreviewCompletion({
      params: {
        textDocument: { uri: URI, version },
        session: 1,
        request: ++request,
        state: "focus",
        contentChanges: text == null ? null : edit(text),
        selectedRange: {
          start: { line: LINE, character: 8 },
          end: { line: LINE, character: 8 },
        },
      },
    });
  const close = (accepted?: string, version = 1) =>
    controller.handlePreviewCompletion({
      params: {
        textDocument: { uri: URI, version: accepted ? version + 1 : version },
        session: 1,
        request: ++request,
        state: "close",
        accepted: accepted
          ? { version, contentChanges: edit(accepted) }
          : undefined,
      },
    });
  /** Answer the compile for `text`, then let the controller act on it. */
  const answer = async (text: string, result?: any) => {
    const index = compiles.findIndex(
      (c) => c.params.contentChanges[0].text === text,
    );
    expect(index, `a compile of "${text}" was requested`).toBeGreaterThanOrEqual(0);
    const [compile] = compiles.splice(index, 1);
    compile!.resolve(
      result ?? {
        textDocument: compile!.params.textDocument,
        program: program(text, 1),
        checkpoint: `SAVE ${text}`,
      },
    );
    await settle();
  };
  return {
    controller,
    workspace,
    compiles,
    shown,
    focus,
    close,
    answer,
    hold,
    REAL,
    playable,
  };
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

afterEach(() => setWorkspace(undefined as any));

for (const worker of [false, true]) {
  describe(worker ? "with the worker displaying the preview" : "with the page displaying the preview", () => {
    beforeEach(() => {
      MODE.worker = worker;
    });

    describe("while a suggestion list is open", () => {
      test("one suggestion is compiled at a time, and only the newest waiting one follows", async () => {
        const { controller, compiles, shown, focus, answer } = harness();
        focus("happy");
        focus("sad");
        focus("angry");
        await settle();
        expect(compiles.map((c) => c.params.contentChanges[0].text)).toEqual(["happy"]);

        await answer("happy");
        // "happy" stopped being wanted while it compiled, so it never reached the
        // screen, and "sad" was replaced by "angry" before it was ever started.
        expect(shown).toEqual([]);
        expect(compiles.map((c) => c.params.contentChanges[0].text)).toEqual(["angry"]);

        await answer("angry");
        expect(shown).toEqual([{ name: "angry", checkpoint: "SAVE angry", speculative: true }]);
        expect(controller.getGameState().completion).toMatchObject({ status: "showing" });
      });

      test("the edit is compiled at the author's line against the version it was made to", async () => {
        const { compiles, focus } = harness();
        focus("happy", 7);
        await settle();
        expect(compiles[0]!.params).toMatchObject({
          textDocument: { uri: URI, version: 7 },
          contentChanges: edit("happy"),
          startFrom: { file: URI, line: LINE },
        });
      });

      test("returning to the suggestion on screen reuses it", async () => {
        const { controller, compiles, shown, focus, answer } = harness();
        focus("happy");
        await answer("happy");
        focus("sad");
        await settle();
        focus("happy");
        await answer("sad");

        expect(shown.map((s) => s.name)).toEqual(["happy"]);
        expect(compiles).toEqual([]);
        expect(controller.getGameState().completion).toMatchObject({ status: "showing" });
      });

      test("returning to a suggestion while another is part way drawn draws it again", async () => {
        const { controller, compiles, shown, focus, answer, hold } = harness();
        focus("happy");
        await answer("happy");
        const happy = controller.screenProgram;
        const release = hold();
        focus("sad");
        await answer("sad");
        // "sad" has started drawing: the game holds its program.
        expect(controller.screenProgram.name).toBe("sad");
        focus("happy");
        await settle();
        await release();

        // "sad" never finished; "happy" was drawn again from the result kept for
        // it, without compiling it again.
        expect(shown.map((s) => s.name)).toEqual(["happy", "happy"]);
        expect(controller.screenProgram).toBe(happy);
        expect(compiles).toEqual([]);
        expect(controller.getGameState().completion).toMatchObject({ status: "showing" });
      });

      test("a suggestion that cannot be worked out after an abandoned draw puts the last frame back", async () => {
        const { controller, shown, focus, answer, hold } = harness();
        focus("happy");
        await answer("happy");
        const happy = controller.screenProgram;
        const release = hold();
        focus("sad");
        await answer("sad");
        focus(null);
        await settle();
        await release();

        expect(shown.map((s) => s.name)).toEqual(["happy", "happy"]);
        expect(controller.screenProgram).toBe(happy);
        expect(controller.getGameState().completion).toMatchObject({ status: "unavailable" });
      });

      test("a suggestion that fails to compile after an abandoned draw puts the last frame back", async () => {
        const { controller, shown, focus, answer, hold } = harness();
        focus("happy");
        await answer("happy");
        const happy = controller.screenProgram;
        const release = hold();
        focus("sad");
        await answer("sad");
        focus("broken");
        await answer("broken", { textDocument: { uri: URI, version: 1 }, program: program("broken", 1, null) });
        await release();

        expect(shown.map((s) => s.name)).toEqual(["happy", "happy"]);
        expect(controller.screenProgram).toBe(happy);
        expect(controller.getGameState().completion).toMatchObject({ status: "unavailable" });
      });

      test("a project file change while a suggestion is shown compiles it again", async () => {
        const { controller, workspace, compiles, shown, focus, answer } = harness();
        focus("happy");
        await answer("happy");
        workspace.filesRevision = 1;
        // The real compile the file change caused arrives while the list is open.
        await controller.loadProgram(program("real, new files", 2), "NEW FILES SAVE");
        await settle();

        expect(compiles.map((c) => c.params.contentChanges[0].text)).toEqual(["happy"]);
        await answer("happy");
        expect(shown.map((s) => s.name)).toEqual(["happy", "happy"]);
        expect(controller.getGameState().completion).toMatchObject({ status: "showing" });
      });

      test("a selection in another document ends the suggestion preview", async () => {
        const { controller, shown, focus, answer } = harness();
        focus("happy");
        await answer("happy");
        await controller.handleSelectedCompilerDocument({
          params: {
            textDocument: { uri: "file://proj/other.sd", version: 1 },
            selectedRange: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
            userEvent: true,
          },
        });

        expect(controller._completionSession).toBeNull();
        expect(controller.getGameState().completion).toBeNull();
        await controller.loadProgram(program("real, other", 2), "OTHER SAVE");
        expect(shown.at(-1)).toMatchObject({ name: "real, other", speculative: false });
      });

      test("the same suggestion against a changed document is compiled again", async () => {
        const { compiles, shown, focus, answer } = harness();
        focus("happy", 1);
        await answer("happy");
        focus("happy", 2);
        await settle();

        expect(compiles.map((c) => c.params.textDocument.version)).toEqual([2]);
        await answer("happy");
        expect(shown).toHaveLength(2);
      });

      test("real programs compiled meanwhile are kept but not shown", async () => {
        const { controller, shown, focus, answer, close } = harness();
        focus("happy");
        await answer("happy");
        const newer = program("real, typed", 2);
        await controller.loadProgram(newer, "NEWER SAVE");

        expect(shown.map((s) => s.name)).toEqual(["happy"]);
        expect(controller._program).toBe(newer);

        await close();
        expect(shown.at(-1)).toEqual({ name: "real, typed", checkpoint: "NEWER SAVE", speculative: false });
      });

      test("a suggestion that cannot be worked out or compiled keeps the frame and says so", async () => {
        const { controller, compiles, shown, focus, answer } = harness();
        focus(null);
        await settle();
        expect(compiles).toEqual([]);
        expect(controller.getGameState().completion).toMatchObject({ status: "unavailable" });

        focus("broken");
        await answer("broken", { textDocument: { uri: URI, version: 1 }, program: program("broken", 1, null) });
        expect(shown).toEqual([]);
        expect(controller.getGameState().completion).toMatchObject({ status: "unavailable" });

        focus("happy");
        await answer("happy");
        expect(shown.map((s) => s.name)).toEqual(["happy"]);
        expect(controller.getGameState().completion).toMatchObject({ status: "showing" });
      });

      test("a suggestion compiled while project files changed is compiled again", async () => {
        const { workspace, compiles, shown, focus, answer } = harness();
        focus("happy");
        await settle();
        workspace.filesRevision = 1;
        await answer("happy");

        expect(shown).toEqual([]);
        expect(compiles.map((c) => c.params.contentChanges[0].text)).toEqual(["happy"]);
        await answer("happy");
        expect(shown.map((s) => s.name)).toEqual(["happy"]);
      });

      test("an answer for a document that has moved on is dropped", async () => {
        const { shown, focus, answer } = harness();
        focus("happy");
        await answer("happy", { textDocument: { uri: URI, version: 1 }, outdated: true });
        expect(shown).toEqual([]);
      });

      test("a notification older than one already handled is ignored", async () => {
        const { controller, compiles } = harness();
        const params = (request: number, text: string) => ({
          params: {
            textDocument: { uri: URI, version: 1 },
            session: 1,
            request,
            state: "focus",
            contentChanges: edit(text),
            selectedRange: { start: { line: LINE, character: 0 }, end: { line: LINE, character: 0 } },
          },
        });
        controller.handlePreviewCompletion(params(5, "newer"));
        controller.handlePreviewCompletion(params(4, "older"));
        await settle();
        expect(compiles.map((c) => c.params.contentChanges[0].text)).toEqual(["newer"]);
      });
    });

    describe("when the list closes", () => {
      test("the real document is shown at once, and a compile still in flight never lands", async () => {
        const { controller, shown, focus, answer, close } = harness();
        focus("happy");
        await answer("happy");
        focus("sad");
        await settle();
        await close();

        expect(shown.at(-1)).toEqual({ name: "real", checkpoint: "REAL SAVE", speculative: false });
        await answer("sad");
        expect(shown.at(-1)!.name).toBe("real");
        expect(controller.getGameState().completion).toBeNull();
      });

      test("real programs held back while it was open are shown, even if no suggestion was", async () => {
        const { controller, shown, focus, close } = harness();
        focus(null);
        await settle();
        await controller.loadProgram(program("real, typed", 2), "TYPED SAVE");
        expect(shown).toEqual([]);

        await close();
        expect(shown).toEqual([{ name: "real, typed", checkpoint: "TYPED SAVE", speculative: false }]);
        expect(controller.getGameState().completion).toBeNull();
      });

      test("an accepted suggestion on screen stays until its own program arrives", async () => {
        const { controller, shown, focus, answer, close } = harness();
        focus("happy");
        await answer("happy");
        await close("happy", 1);

        expect(shown.map((s) => s.name)).toEqual(["happy"]);
        // A program compiled before the acceptance does not replace it.
        await controller.loadProgram(program("before acceptance", 1), "OLD");
        expect(shown.map((s) => s.name)).toEqual(["happy"]);
        await controller.loadProgram(program("accepted", 2), "ACCEPTED");
        expect(shown.at(-1)).toEqual({ name: "accepted", checkpoint: "ACCEPTED", speculative: false });
      });

      test("an accepted suggestion that is not the one on screen shows the real document", async () => {
        const { shown, focus, answer, close } = harness();
        focus("happy");
        await answer("happy");
        await close("sad", 1);
        expect(shown.at(-1)!.name).toBe("real");
      });

      test("a real document that stopped compiling while it was open is marked, even if no suggestion was shown", async () => {
        const { controller, shown, focus, close } = harness();
        focus(null);
        await settle();
        await controller.loadProgram(program("does not compile", 2, null), undefined);
        await close();

        expect(shown).toEqual([]);
        expect(controller.getGameState().completion).toMatchObject({ status: "stale" });
      });

      test("closing while a suggestion is part way drawn over a document that does not compile puts the last frame back", async () => {
        const { controller, shown, focus, answer, close, hold } = harness();
        focus("happy");
        await answer("happy");
        const happy = controller.screenProgram;
        await controller.loadProgram(program("does not compile", 2, null), undefined);
        const release = hold();
        focus("sad");
        await answer("sad");
        const closing = close();
        await settle();
        await release();
        await closing;

        expect(shown.map((s) => s.name)).toEqual(["happy", "happy"]);
        expect(controller.screenProgram).toBe(happy);
        expect(controller.getGameState().completion).toMatchObject({ status: "stale" });
      });

      test("a real document that does not compile keeps the last frame, marked", async () => {
        const { controller, shown, focus, answer, close } = harness();
        focus("happy");
        await answer("happy");
        await controller.loadProgram(program("does not compile", 2, null), undefined);
        await close();

        expect(shown.map((s) => s.name)).toEqual(["happy"]);
        expect(controller.getGameState().completion).toMatchObject({ status: "stale" });

        await controller.loadProgram(program("fixed", 3), "FIXED");
        expect(shown.at(-1)).toMatchObject({ name: "fixed", speculative: false });
        expect(controller.getGameState().completion).toBeNull();
      });
    });

    describe("a preview that is not open and stopped", () => {
      test("takes no part while the game is running", async () => {
        const { controller, compiles, focus } = harness();
        controller._game = { state: "running", program: controller.screenProgram };
        focus("happy");
        await settle();
        expect(compiles).toEqual([]);
      });

      test("takes no part while it has no size", async () => {
        const { controller, compiles, focus } = harness();
        controller.refs = { game: { clientWidth: 0, clientHeight: 0 } };
        focus("happy");
        await settle();
        expect(compiles).toEqual([]);
      });

      test("PLAY ends the preview, and nothing compiled for it reaches the screen", async () => {
        const { controller, shown, focus, answer, playable } = harness();
        focus("happy");
        await settle();
        const played: any[] = [];
        controller.buildGame = async (p: any) => {
          played.push(p);
          controller._game = { state: "running", program: p, start: () => {} };
          return controller._game;
        };
        controller.simulate = () => {};
        controller.listen = () => {};
        controller.buildApp = async () => ({ start: () => {} });
        controller.updateLaunchStateIcon = () => {};
        await controller.startGameAndApp();

        expect(played).toEqual([playable]);
        await answer("happy");
        expect(shown).toEqual([]);
        expect(controller.getGameState().completion).toBeNull();
      });
    });

    describe("what the game reports while it shows a suggestion", () => {
      test("is not passed on as the author's", async () => {
        const { controller, focus, answer, REAL } = harness();
        const listeners: Record<string, (message: any) => void> = {};
        const addListener = (method: string, l: any) => {
          listeners[method] = l;
          return () => {};
        };
        if (MODE.worker) {
          // What the worker's game reports reaches the controller through the
          // workspace's link to it.
          controller.listenToWorker({ addListener });
        } else {
          const game = {
            state: "previewing",
            program: REAL,
            connection: { outgoing: { addListener } },
          };
          controller._game = game;
          controller.listen(game);
        }
        const sent: string[] = [];
        controller.host.addEventListener("jsonrpc", (e: CustomEvent) => sent.push(e.detail.method));
        const executed = GameExecutedMessage.type.notification({
          executedLines: {}, state: "previewing", restarted: false, simulatePath: "", conditions: [], choices: [],
        } as any);

        listeners[GameExecutedMessage.method]!(executed);
        expect(sent).toContain(GameExecutedMessage.method);

        sent.length = 0;
        focus("happy");
        await answer("happy");
        listeners[GameExecutedMessage.method]!(executed);
        expect(sent).not.toContain(GameExecutedMessage.method);
      });
    });
  });
}
