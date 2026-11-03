import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameClickedToContinueMessage";
import { GameHitBreakpointMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameHitBreakpointMessage";
import { GameSteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSteppedMessage";
import { GetGameThreadsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameThreadsMessage";
import { PauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const FIN = "scene start\n  First.\n  Hello.\n  fin\nend\n";
const HELLO = 2;

const location = {
  uri: MAIN_URI,
  range: { start: { line: 1, character: 0 }, end: { line: 1, character: 4 } },
};

const start = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: FIN }],
    startFrom: { file: MAIN_URI, line: HELLO },
    manualClock: true,
  });
  const doc = h.overlay.ownerDocument;
  const win = doc.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
  h.refs.toolbar = doc.createElement("div");
  h.refs.endingStatus = doc.createElement("span");
  h.refs.endingStatus.hidden = true;
  await h.compile();
  await h.select(HELLO);
  await settle(40);
  expect(await h.controller.startGameAndApp()).toBe(true);
  await settle(40);
  await h.tick(1000 / 60, 60);
  return h;
};

const click = async (h: any) => {
  h.controller._app.emit(
    EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
  );
  await settle(10);
  await h.tick(1000 / 60, 60);
  await settle(20);
};

const sent = (h: any, method: string) =>
  h.toEditor.filter((m: any) => m.method === method).map((m: any) => m.params);

describe("PLAY in the worker naming its run", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stamps the run on every debugger notification it forwards from a run's worker game", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: FIN }],
      startFrom: { file: MAIN_URI, line: HELLO },
      manualClock: true,
    });
    try {
      const listeners = new Map<string, (msg: any) => void>();
      h.controller.listen(
        {
          connection: {
            outgoing: {
              addListener: (method: string, listener: (msg: any) => void) =>
                listeners.set(method, listener),
            },
          },
        },
        { run: 7 },
      );
      const notifications = [
        GameSteppedMessage.type.notification({ location }),
        GameHitBreakpointMessage.type.notification({ location }),
        GameAwaitingInteractionMessage.type.notification({ location }),
        GameAutoAdvancedToContinueMessage.type.notification({ location }),
        GameClickedToContinueMessage.type.notification({ location }),
        GameChosePathToContinueMessage.type.notification({ location }),
      ];
      for (const notification of notifications) {
        listeners.get(notification.method)!(notification);
        expect(sent(h, notification.method).at(-1)).toEqual({
          location,
          run: 7,
        });
      }
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  it("names the run on its state, its forwarded stops, its ending and its answers", async () => {
    const h = await start();
    try {
      const run = h.controller._workerPlay.run;
      expect(typeof run).toBe("number");
      expect(h.controller.getGameState().run).toBe(run);
      await click(h);
      expect(sent(h, "game/clickedToContinue").at(-1)?.run).toBe(run);
      expect(sent(h, "game/ended")).toEqual([
        expect.objectContaining({ kind: "fin", run }),
      ]);
      expect(sent(h, "preview/didChangeGameState").at(-1)).toEqual(
        expect.objectContaining({ launchState: "ended", run }),
      );
      const threads = await h.controller.handleGetGameThreads(
        GetGameThreadsMessage.type.request({}),
      );
      expect(threads.result).toEqual(expect.objectContaining({ run }));
      const paused = await h.controller.handlePauseGame(
        PauseGameMessage.type.request({}),
      );
      expect(paused.result).toEqual({ run });
      await h.controller.stopGame("finished");
      await settle(20);
      expect(sent(h, "game/exited").at(-1)).toEqual(
        expect.objectContaining({ reason: "finished", run }),
      );
      expect(h.controller.getGameState().run).toBeNull();
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);

  it("gives a replacement run a new run", async () => {
    const h = await start();
    try {
      const first = h.controller._workerPlay.run;
      await click(h);
      expect(await h.controller.restartGame(true)).toBe(true);
      await settle(40);
      await h.tick(1000 / 60, 60);
      const second = h.controller._workerPlay.run;
      expect(typeof second).toBe("number");
      expect(second).not.toBe(first);
      expect(h.controller.getGameState().run).toBe(second);
      await click(h);
      expect(sent(h, "game/ended").at(-1)).toEqual(
        expect.objectContaining({ run: second }),
      );
    } finally {
      await h.controller.destroyGameAndApp();
      h.dispose();
    }
  }, 120_000);
});
