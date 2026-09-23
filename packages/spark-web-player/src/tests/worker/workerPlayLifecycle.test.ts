// PLAY in the worker takes several round trips to start and one to stop, and
// the author can press STOP, or an edit can restart the game, at any of them
// (#682). Whatever the order, STOP ends PLAY: the page is not left waiting,
// no game is left running in the worker, and the preview shows again.
import { PauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import { describe, expect, it } from "vitest";
import { ConnectPlayMessage } from "../../main/workers/messages/ConnectPlayMessage";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { PlayMessage } from "../../main/workers/messages/PlayMessage";
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

/** A gate a test opens when it is ready. */
const gate = () => {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => (open = resolve));
  return { opened, open };
};

describe("STOP while PLAY in the worker is starting", () => {
  it("ends PLAY while its game waits on the page to connect", async () => {
    const h = await createPlayerHarness({
      workerDisplays: true,
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
      workerDisplays: true,
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
      workerDisplays: true,
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

      // The author edits: the program compiled from the edit reaches the
      // controller, which schedules the restart.
      await h.edit([
        {
          range: {
            start: { line: AFTER, character: 4 },
            end: { line: AFTER, character: 4 + "The beat after it.".length },
          },
          text: "The beat after it, edited.",
        },
      ]);
      expect(await settlesWithin(h.compile(), 5000)).toBe("settled");
      expect(h.controller._restartGameTimeout).toBeDefined();
      expect(await settlesWithin(waiting.previewed, 5000)).toBe("settled");
    } finally {
      h.controller.cancelScheduledRestart();
      await h.controller.destroyGameAndApp();
      h.workerState.gameState.running?.destroy();
      h.dispose();
    }
  }, 120_000);
});

describe("an edit's restart under way when the author presses STOP", () => {
  it("does not start the game again", async () => {
    const h = await createPlayerHarness({
      workerDisplays: true,
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
      workerDisplays: true,
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
