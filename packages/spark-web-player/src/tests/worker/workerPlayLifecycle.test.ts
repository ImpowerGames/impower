// PLAY in the worker takes several round trips to start and one to stop, and
// the author can press STOP, or an edit can restart the game, at any of them
// (#682). Whatever the order, STOP ends PLAY: the page is not left waiting,
// no game is left running in the worker, and the preview shows again.
import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
import { GameReloadedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameReloadedMessage";
import { StepGameClockMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameClockMessage";
import { StepGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameMessage";
import { ErrorType } from "@impower/spark-engine/src/game/core/enums/ErrorType";
import { PauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import { UnpauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/UnpauseGameMessage";
import { describe, expect, it } from "vitest";
import { ConnectPlayMessage } from "../../main/workers/messages/ConnectPlayMessage";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { PlayMessage } from "../../main/workers/messages/PlayMessage";
import { StartPlayMessage } from "../../main/workers/messages/StartPlayMessage";
import { StopPlayMessage } from "../../main/workers/messages/StopPlayMessage";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `define SPRITE_A as image with
  src = "https://example.com/a.png"
end

-> start

scene start
  HERO:
    [[SPRITE_A]]
    The beat with a picture.

  HERO:
    The beat after it.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((l) => l.includes(text));
const PICTURED = lineOf("The beat with a picture.");
const AFTER = lineOf("The beat after it.");

/** STOP waits a frame between its steps, which this page does not draw. */
const framesForStop = (h: { overlay: HTMLElement }) => {
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
};

/** Whether `work` settles within `ms`. */
const settlesWithin = async (work: Promise<unknown>, ms: number) =>
  Promise.race([
    work.then(
      () => "settled",
      () => "settled",
    ),
    new Promise((resolve) => setTimeout(() => resolve("waiting"), ms)),
  ]);

/** Whether the editor has been told the game restarted after an edit. */
const reloaded = (h: { toEditor: any[] }) =>
  h.toEditor.some((m) => m.method === GameReloadedMessage.method);

/** Hold the worker's answers to the first request of `method` the page
 *  sends from now on, until the returned gate opens; `asked` says whether
 *  it has been sent. */
const holdAnswer = (h: any, method: string) => {
  const answered = gate();
  const request = h.link.request.bind(h.link);
  const state = { asked: false };
  h.link.request = async (type: any, params: any) => {
    if (type.method === method && !state.asked) {
      state.asked = true;
      const answer = await request(type, params);
      await answered.opened;
      return answer;
    }
    return request(type, params);
  };
  return { ...answered, state };
};

/** A gate a test opens when it is ready. */
const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
};

describe("STOP while PLAY in the worker is starting", () => {
  it("ends PLAY while its game waits on the page to connect", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: PICTURED },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(PICTURED);
      expect(h.overlay.textContent).toContain("The beat with a picture.");

      // From the moment PLAY's game connects, the page answers nothing it
      // asks until the test lets it, so the connect is still restoring when
      // STOP comes.
      const heldAnswers: any[] = [];
      let holdAnswers = false;
      const receive = h.link.receive.bind(h.link);
      (h.link as any).receive = (message: any) => {
        if (holdAnswers && "id" in message && !("params" in message)) {
          heldAnswers.push(message);
          return;
        }
        receive(message);
      };
      let connected = false;
      const request = h.link.request.bind(h.link);
      (h.link as any).request = (type: any, params: any) => {
        const answer = request(type, params);
        if (type.method === ConnectPlayMessage.method) {
          holdAnswers = true;
          answer.then(
            () => (connected = true),
            () => (connected = true),
          );
        }
        return answer;
      };
      const started = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && heldAnswers.length === 0; i++) await settle(2);
      expect(heldAnswers.length).toBeGreaterThan(0);
      expect(connected).toBe(false);

      // STOP, and only then the page's answers.
      const stopped = h.controller.stopGame("quit");
      await settle(5);
      holdAnswers = false;
      for (const message of heldAnswers.splice(0)) receive(message);
      expect(await settlesWithin(Promise.all([started, stopped]), 5000)).toBe("settled");
      // A boolean: a failure prints what it compares, and a game is a large
      // object to print.
      expect(h.workerState.gameState.running == null).toBe(true);

      // The preview shows again.
      await h.select(AFTER);
      await settle(40);
      expect(h.overlay.textContent).toContain("The beat after it.");
    } finally {
      // A game a failure left running would tick on after the test.
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);

  it("leaves no game running when STOP comes before the worker is asked to build one", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);

      // PLAY waits for the preview's application to go, as it does while a
      // selection's preview is still being built, and STOP comes then.
      const detached = gate();
      const detach = h.controller.detachWorkerPreview.bind(h.controller);
      let held = false;
      h.controller.detachWorkerPreview = async () => {
        if (!held) {
          held = true;
          await detached.opened;
        }
        return detach();
      };
      const started = h.controller.startGameAndApp();
      await settle(5);
      const stopped = h.controller.stopGame("quit");
      await settle(5);
      detached.open();
      await Promise.all([started, stopped]);
      await settle(40);

      // A boolean: a failure prints what it compares, and a game is a large
      // object to print.
      expect(h.workerState.gameState.running == null).toBe(true);
      // The game that previews still reaches the page.
      await h.select(PICTURED);
      await settle(40);
      expect(h.overlay.textContent).toContain("The beat with a picture.");
    } finally {
      // A game a failure left running would tick on after the test.
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("PLAY while a preview is still being displayed", () => {
  it("takes the next program and restarts on an edit", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      // The display a selection asks for is still waiting in the worker when
      // PLAY takes the page, and the worker never answers it: the page's
      // preview application, which would have told the display that its
      // fonts and pictures arrived, goes with PLAY.
      const request = h.link.request.bind(h.link);
      (h.link as any).request = (type: any, params: any) =>
        type.method === DisplayPreviewMessage.method
          ? new Promise(() => {})
          : request(type, params);
      const waiting = await h.selectWithoutWaiting(PICTURED);
      await settle(20);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(20);

      // The author edits the line PLAY restarts from, the one selected last:
      // the program compiled from the edit reaches the controller, which
      // restarts the game.
      await h.edit([
        {
          range: {
            start: { line: PICTURED, character: 4 },
            end: { line: PICTURED, character: 4 + "The beat with a picture.".length },
          },
          text: "The beat with a picture, edited.",
        },
      ]);
      expect(await settlesWithin(h.compile(), 5000)).toBe("settled");
      expect(await settlesWithin(waiting.previewed, 5000)).toBe("settled");
      // The restart runs, and the game plays the edited program.
      for (let i = 0; i < 200 && !reloaded(h); i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(reloaded(h)).toBe(true);
      for (let i = 0; i < 100 && !/picture, edited\./.test(h.overlay.textContent ?? ""); i++) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      expect(h.overlay.textContent).toContain("The beat with a picture, edited.");
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("an edit's restart under way when the author presses STOP", () => {
  it("does not start the game again", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(20);

      // The restart's teardown waits for the worker to stop the old game.
      const answered = gate();
      const request = h.link.request.bind(h.link);
      let holdStop = true;
      (h.link as any).request = async (type: any, params: any) => {
        const answer = await request(type, params);
        if (type.method === StopPlayMessage.method && holdStop) {
          holdStop = false;
          await answered.opened;
        }
        return answer;
      };
      const restarting = h.controller.restartGame();
      await settle(10);
      await h.controller.stopGame("quit");
      answered.open();
      expect(await restarting).toBe(false);
      await settle(40);

      // A boolean: a failure prints what it compares, and a game is a large
      // object to print.
      expect(h.workerState.gameState.running == null).toBe(true);
      expect(h.controller.playing).toBe(false);
    } finally {
      // A game a failure left running would tick on after the test.
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("pause while PLAY in the worker is starting", () => {
  it("does not pause the game that previews before PLAY's game exists", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    try {
      await h.compile();
      await h.select(AFTER);

      // The editor pauses while the worker is still asked to build PLAY's
      // game: the page has no application to pause yet, and the worker has
      // only the game that previews.
      const built = gate();
      const request = h.link.request.bind(h.link);
      let asked = false;
      (h.link as any).request = async (type: any, params: any) => {
        if (type.method === PlayMessage.method && !asked) {
          asked = true;
          await built.opened;
        }
        return request(type, params);
      };
      const started = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !asked; i++) await settle(2);
      const paused = await h.controller.handlePauseGame(PauseGameMessage.type.request({}));
      // As with a game on this page, a pause before there is an application
      // is answered as one with no game.
      expect("error" in paused).toBe(true);
      await settle(10);
      expect(h.workerState.gameState.game!.paused).toBe(false);
      built.open();
      expect(await started).toBe(true);
      await settle(20);

      // PLAY's game and its application agree: neither is paused.
      expect(h.workerState.gameState.running!.paused).toBe(false);
      expect(h.controller._app.paused).toBe(false);
      expect(h.workerState.gameState.game!.paused).toBe(false);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("pause and unpause while PLAY in the worker is starting", () => {
  it("leaves the game and its application in the state the editor asked for last", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    try {
      await h.compile();
      await h.select(AFTER);

      // The editor pauses once the application exists, and unpauses while
      // the worker's answer that it started is on its way.
      const connecting = holdAnswer(h, ConnectPlayMessage.method);
      const started = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !connecting.state.asked; i++) await settle(2);
      await h.controller.handlePauseGame(PauseGameMessage.type.request({}));
      const starting = holdAnswer(h, StartPlayMessage.method);
      connecting.open();
      for (let i = 0; i < 100 && !starting.state.asked; i++) await settle(2);
      await h.controller.handleUnpauseGame(UnpauseGameMessage.type.request({}));
      starting.open();
      expect(await started).toBe(true);
      await settle(20);

      expect(h.controller._app.paused).toBe(false);
      expect(h.workerState.gameState.running!.paused).toBe(false);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);

  it("hands nothing a stopped start was told to the next PLAY", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);

      // The editor pauses the first start, then STOP and a new PLAY come
      // while the worker's answer that the first one started is on its way.
      const connecting = holdAnswer(h, ConnectPlayMessage.method);
      const first = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !connecting.state.asked; i++) await settle(2);
      await h.controller.handlePauseGame(PauseGameMessage.type.request({}));
      const starting = holdAnswer(h, StartPlayMessage.method);
      connecting.open();
      for (let i = 0; i < 100 && !starting.state.asked; i++) await settle(2);
      await h.controller.stopGame("quit");
      const second = h.controller.startGameAndApp();
      await settle(20);
      starting.open();
      expect(await first).toBe(false);
      expect(await second).toBe(true);
      await settle(20);

      expect(h.controller._app.paused).toBe(false);
      expect(h.workerState.gameState.running!.paused).toBe(false);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("the controls that move time while PLAY in the worker is starting", () => {
  it("keeps a game paused during its start from ticking before the start is answered", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
      manualClock: true,
    });
    try {
      await h.compile();
      await h.select(AFTER);

      // Paused once the application exists; the worker then starts the game,
      // and its frames run while its answer is on its way.
      const connecting = holdAnswer(h, ConnectPlayMessage.method);
      const started = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !connecting.state.asked; i++) await settle(2);
      await h.controller.handlePauseGame(PauseGameMessage.type.request({}));
      const starting = holdAnswer(h, StartPlayMessage.method);
      connecting.open();
      for (let i = 0; i < 100 && !starting.state.asked; i++) await settle(2);
      await settle(10);
      const running = h.workerState.gameState.running!;
      await h.tick(1000 / 60, 60);
      expect(running.paused).toBe(true);
      expect(running.clock!.elapsedTime).toBe(0);
      starting.open();
      expect(await started).toBe(true);
      expect(running.paused).toBe(true);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);

  it("steps the game by a clock step made during its start, as its application", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
      manualClock: true,
    });
    try {
      await h.compile();
      await h.select(AFTER);
      const connecting = holdAnswer(h, ConnectPlayMessage.method);
      const started = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !connecting.state.asked; i++) await settle(2);
      await h.controller.handleStepGameClock(StepGameClockMessage.type.request({ seconds: 2.5 }));
      connecting.open();
      expect(await started).toBe(true);
      await settle(10);
      // How far each clock has been moved from the time it reads.
      const offset = (clock: any) => clock._timeOffset;
      expect(offset(h.controller._app.clock)).toBeCloseTo(2.5, 9);
      expect(offset(h.workerState.gameState.running!.clock)).toBeCloseTo(2.5, 9);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("a runtime error as PLAY's game in the worker starts", () => {
  it("stops PLAY and tells the editor why", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    const error = console.error;
    console.error = () => {};
    try {
      await h.compile();
      await h.select(AFTER);
      // The game's first execution fails, before the worker answers that it
      // started.
      const createGame = h.workerState.gameState.createGame;
      h.workerState.gameState.createGame = (options: any) => {
        const game = createGame(options);
        if (h.workerState.gameState.game) {
          const start = game.start.bind(game);
          game.start = (...args: any[]) => {
            start(...args);
            void game.connection.emit(
              GameEncounteredRuntimeErrorMessage.type.notification({
                type: ErrorType.Error,
                message: "The first beat failed.",
                location: { uri: MAIN_URI, range: { start: { line: AFTER, character: 0 }, end: { line: AFTER, character: 0 } } },
                state: "running",
              } as any),
            );
          };
        }
        return game;
      };
      await h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !h.toEditor.some((m) => m.method === "game/exited"); i++) {
        await settle(2);
      }
      const exited = h.toEditor.find((m) => m.method === "game/exited");
      expect(exited?.params?.reason).toBe("error");
      expect(h.workerState.gameState.running == null).toBe(true);
      expect(h.controller.playing).toBe(false);
    } finally {
      console.error = error;
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("PLAY pressed again while the worker stops the last run", () => {
  it("leaves the new run and its application to the new PLAY", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(10);

      const stopping = holdAnswer(h, StopPlayMessage.method);
      const stopped = h.controller.stopGame("quit");
      for (let i = 0; i < 100 && !stopping.state.asked; i++) await settle(2);
      expect(await h.controller.startGameAndApp()).toBe(true);
      const app = h.controller._app;
      stopping.open();
      await stopped;
      await settle(20);

      expect(h.workerState.gameState.running == null).toBe(false);
      expect(h.controller.playing).toBe(true);
      expect(h.controller._app).toBe(app);
      expect(app.destroys).toBe(0);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("a debugger step the worker fails", () => {
  it("answers the editor with the worker's failure", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    try {
      await h.compile();
      (h.link as any).request = async () => {
        throw new Error("The worker could not step.");
      };
      const stepped = await h.controller.handleStepGame(
        StepGameMessage.type.request({ traversal: "over" }),
      );
      expect(stepped.error?.message).toContain("The worker could not step.");
    } finally {
      h.dispose();
    }
  }, 120_000);
});

describe("STOP during the new start of an edit's restart", () => {
  it("answers that nothing restarted, so the editor hears no reload", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(10);

      // The restart has torn the old run down and asked the worker for the
      // new one; the author presses STOP before the worker's answer lands.
      const building = holdAnswer(h, PlayMessage.method);
      const restarting = h.controller.restartGame();
      for (let i = 0; i < 100 && !building.state.asked; i++) await settle(2);
      expect(building.state.asked).toBe(true);
      await h.controller.stopGame("quit");
      building.open();

      expect(await restarting).toBe(false);
      await settle(20);
      expect(h.workerState.gameState.running == null).toBe(true);
      expect(h.controller.playing).toBe(false);
    } finally {
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("PLAY pressed again while STOP waits for its frames", () => {
  it("tells the editor nothing of the old run and leaves the new one running", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    // STOP's frames, held until the test lets them run.
    const win = h.overlay.ownerDocument.defaultView as any;
    const frames: (() => void)[] = [];
    win.requestAnimationFrame = (callback: () => void) => frames.push(callback);
    try {
      await h.compile();
      await h.select(AFTER);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(10);

      const stopped = h.controller.stopGame("quit");
      for (let i = 0; i < 100 && frames.length === 0; i++) await settle(2);
      expect(frames.length).toBe(1);
      h.toEditor.length = 0;
      h.workspace.selections.length = 0;
      expect(await h.controller.startGameAndApp()).toBe(true);
      // Let STOP's frames run, however many it still asks for.
      let done = false;
      void stopped.then(() => (done = true));
      for (let i = 0; i < 20 && !done; i++) {
        frames.splice(0).forEach((frame) => frame());
        await settle(5);
      }
      expect(done).toBe(true);

      expect(h.toEditor.filter((m) => m.method === "game/exited")).toEqual([]);
      expect(h.workspace.selections).toEqual([]);
      expect(h.workerState.gameState.running == null).toBe(false);
      expect(h.controller.playing).toBe(true);
    } finally {
      win.requestAnimationFrame = (callback: () => void) => setTimeout(callback, 0);
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("STOP while PLAY waits for the first program", () => {
  it("ends that PLAY before it asks the worker for a game", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      // Nothing has compiled yet, so PLAY waits for the first program.
      const starting = h.controller.startGameAndApp();
      await settle(10);
      await h.controller.stopGame("quit");
      await h.compile();

      expect(await starting).toBe(false);
      await settle(20);
      expect(h.workerState.gameState.running == null).toBe(true);
      expect(h.controller.playing).toBe(false);
    } finally {
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("the controller going while PLAY runs", () => {
  it("destroys PLAY's application with the game", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(10);
      const app = h.controller._app;
      expect(app != null).toBe(true);

      h.controller.dispose();
      await settle(40);

      expect(app.destroys).toBe(1);
      expect(h.controller._app == null).toBe(true);
      expect(h.workerState.gameState.running == null).toBe(true);
    } finally {
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("the PLAY button pressed before the first program, then STOP", () => {
  it("does not tell the editor a game started", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      const clicked = h.controller.handleClickPlayButton();
      await settle(10);
      await h.controller.stopGame("quit");
      h.toEditor.length = 0;
      await h.compile();
      await clicked;
      await settle(20);

      expect(h.toEditor.filter((m) => m.method === "game/started")).toEqual([]);
      expect(h.workerState.gameState.running == null).toBe(true);
      expect(h.controller.playing).toBe(false);
    } finally {
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("PLAY pressed during an edit's restart", () => {
  it("keeps the new PLAY when it comes while the old run stops", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(10);

      const stopping = holdAnswer(h, StopPlayMessage.method);
      const restarting = h.controller.restartGame();
      for (let i = 0; i < 100 && !stopping.state.asked; i++) await settle(2);
      expect(await h.controller.startGameAndApp()).toBe(true);
      const game = h.workerState.gameState.running;
      stopping.open();

      expect(await restarting).toBe(false);
      await settle(20);
      expect(h.workerState.gameState.running === game).toBe(true);
      expect(h.controller.playing).toBe(true);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);

  it("answers that nothing restarted when the new PLAY overtakes the restart's start", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(10);

      const building = holdAnswer(h, PlayMessage.method);
      const restarting = h.controller.restartGame();
      for (let i = 0; i < 100 && !building.state.asked; i++) await settle(2);
      expect(building.state.asked).toBe(true);
      const newer = h.controller.startGameAndApp();
      building.open();

      expect(await newer).toBe(true);
      expect(await restarting).toBe(false);
      expect(h.controller.playing).toBe(true);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("the controller going while STOP waits for the worker", () => {
  it("tells the editor nothing more of the run", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(10);

      const stopping = holdAnswer(h, StopPlayMessage.method);
      const stopped = h.controller.stopGame("quit");
      for (let i = 0; i < 100 && !stopping.state.asked; i++) await settle(2);
      h.controller.dispose();
      h.toEditor.length = 0;
      h.workspace.selections.length = 0;
      stopping.open();
      await stopped;
      await settle(20);

      expect(h.toEditor.map((m) => m.method)).toEqual([]);
      expect(h.workspace.selections).toEqual([]);
      expect(h.controller.getGameState().launchState).toBe(null);
    } finally {
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("the controller going while PLAY's application is built", () => {
  it("destroys that application once", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);
      // PLAY's application connects its game last in its build; hold that.
      const connecting = holdAnswer(h, ConnectPlayMessage.method);
      const starting = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !connecting.state.asked; i++) await settle(2);
      expect(connecting.state.asked).toBe(true);
      const app = h.controller._app;
      expect(app != null).toBe(true);
      h.controller.dispose();
      connecting.open();
      expect(await starting).toBe(false);
      await settle(40);

      expect(app.destroys).toBe(1);
      expect(h.workerState.gameState.running == null).toBe(true);
    } finally {
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

/** How many listeners the page holds on the worker's games. */
const listeners = (h: any) => {
  let count = 0;
  for (const set of h.link._listeners.values()) count += set.size;
  return count;
};

describe("the PLAY button pressed while the audio context resumes", () => {
  for (const ending of ["STOP", "the controller going"] as const) {
    it(`starts nothing after ${ending}`, async () => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: AFTER },
      });
      framesForStop(h);
      try {
        await h.compile();
        await h.select(AFTER);
        const resumed = gate();
        h.controller.ensureAudioContext = () => resumed.opened;
        const clicked = h.controller.handleClickPlayButton();
        await settle(10);
        if (ending === "STOP") {
          await h.controller.stopGame("quit");
        } else {
          h.controller.dispose();
        }
        h.toEditor.length = 0;
        resumed.open();
        await clicked;
        await settle(40);

        expect(h.toEditor.map((m) => m.method)).toEqual([]);
        expect(h.workerState.gameState.running == null).toBe(true);
        expect(h.controller.playing).toBe(false);
      } finally {
        h.workerState.gameState.running?.destroy();
        h.dispose();
      }
    }, 120_000);
  }
});

describe("a newer PLAY while the last one builds its application", () => {
  it("leaves one set of listeners, and one destroy of the abandoned application", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);

      // PLAY A has built its run and listens; its application's connect waits.
      const connectingA = holdAnswer(h, ConnectPlayMessage.method);
      const startingA = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !connectingA.state.asked; i++) await settle(2);
      expect(connectingA.state.asked).toBe(true);
      const appA = h.controller._app;

      // PLAY B has been answered but waits before building its application.
      const buildingB = holdAnswer(h, PlayMessage.method);
      const startingB = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !buildingB.state.asked; i++) await settle(2);
      connectingA.open();
      expect(await startingA).toBe(false);
      buildingB.open();
      expect(await startingB).toBe(true);
      await settle(20);

      expect(appA.destroys).toBe(1);
      expect(h.controller._app === appA).toBe(false);
      // What listens now is PLAY B alone: as many listeners as a PLAY that
      // raced nothing holds.
      const raced = listeners(h);
      await h.controller.stopGame("quit");
      await settle(20);
      expect(await h.controller.startGameAndApp()).toBe(true);
      await settle(20);
      expect(raced).toBe(listeners(h));
      // And the controller going leaves none.
      h.controller.dispose();
      await settle(20);
      expect(listeners(h)).toBe(0);
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("game/start from the editor while the controller goes", () => {
  it("publishes nothing after the controller has gone", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);
      const connecting = holdAnswer(h, ConnectPlayMessage.method);
      const started = h.controller.handleStartGame({ jsonrpc: "2.0", id: "start", method: "game/start", params: {} });
      for (let i = 0; i < 100 && !connecting.state.asked; i++) await settle(2);
      h.controller.dispose();
      h.toEditor.length = 0;
      connecting.open();
      await started;
      await settle(20);

      expect(h.toEditor.map((m) => m.method)).toEqual([]);
      expect(h.controller.getGameState().launchState).toBe(null);
    } finally {
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("the editor's controls while an edit's restart stops the old run", () => {
  for (const control of ["pause", "clock step"] as const) {
    it(`answers that no game took a ${control}, and the new run starts without it`, async () => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SOURCE }],
        startFrom: { file: MAIN_URI, line: AFTER },
        manualClock: true,
      });
      framesForStop(h);
      try {
        await h.compile();
        await h.select(AFTER);
        expect(await h.controller.startGameAndApp()).toBe(true);
        await settle(10);

        const stopping = holdAnswer(h, StopPlayMessage.method);
        const restarting = h.controller.restartGame();
        for (let i = 0; i < 100 && !stopping.state.asked; i++) await settle(2);
        expect(stopping.state.asked).toBe(true);
        const answer =
          control === "pause"
            ? await h.controller.handlePauseGame(PauseGameMessage.type.request({}))
            : await h.controller.handleStepGameClock(
                StepGameClockMessage.type.request({ seconds: 2.5 }),
              );
        stopping.open();
        expect(await restarting).toBe(true);
        await settle(20);

        // The old run's application heard it and went; the editor is told
        // no game took it, so it does not show a pause or a step that the
        // new run never had.
        expect(answer.error?.message).toBe("no game loaded");
        const offset = (clock: any) => clock._timeOffset;
        expect(h.controller._app.paused).toBe(false);
        expect(h.workerState.gameState.running!.paused).toBe(false);
        expect(offset(h.controller._app.clock)).toBe(0);
      } finally {
        await h.controller.destroyGameAndApp();
        h.workerState.gameState.running?.destroy();
        h.dispose();
      }
    }, 120_000);
  }
});

describe("three PLAYs pressed while the first builds its application", () => {
  it("leaves the last PLAY's application in the slot, where STOP destroys it", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: AFTER },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(AFTER);

      // PLAY A's application waits to connect, so it has not initialized.
      const connectingA = holdAnswer(h, ConnectPlayMessage.method);
      const startingA = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !connectingA.state.asked; i++) await settle(2);
      expect(connectingA.state.asked).toBe(true);
      const appA = h.controller._app;

      // PLAY B waits for A's application to finish its teardown.
      const startingB = h.controller.startGameAndApp();
      for (let i = 0; i < 100 && !appA.destroyed; i++) await settle(2);
      expect(appA.destroyed).toBe(true);

      // PLAY C comes while B still waits, and A's application initializes
      // after it.
      const startingC = h.controller.startGameAndApp();
      await settle(20);
      connectingA.open();
      const started = await Promise.all([startingA, startingB, startingC]);
      await settle(20);

      expect(started).toEqual([false, false, true]);
      const appC = h.controller._app;
      expect(appC && appC !== appA).toBe(true);
      expect(appC.destroyed).toBe(false);
      await h.controller.stopGame("quit");
      await settle(20);
      expect(appC.destroyed).toBe(true);
      expect(h.playing()).toBeFalsy();
    } finally {
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});
