// #679 — a script that never yields keeps the player's worker from answering
// anything, STOP included. The worker says so while it runs (a notice for a
// story that has run without a break), the page restarts it once that has
// gone on for longer than it waits, and the page carries on: STOP ends PLAY,
// a stopped preview gives up the point that would run the loop again, the
// author is told the line, and the preview returns from the new worker.
//
// These tests run the worker in the test's own thread, where a loop that never
// yields would never yield to the test either. So the stuck worker is one
// that stops answering (`stall`), and its notices are the watch's own,
// called as a running story calls it.
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GameWorkerRestartedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameWorkerRestartedMessage";
import { executionWatch } from "@impower/sparkdown/src/inkjs/engine/ExecutionWatch";
import { describe, expect, it, vi } from "vitest";
import { DisplayPreviewMessage } from "../../main/workers/messages/DisplayPreviewMessage";
import { WorkerBusyMessage } from "../../main/workers/messages/WorkerBusyMessage";
import {
  BUSY_NOTICE_AFTER_MS,
  BUSY_NOTICE_EVERY_MS,
  watchExecution,
} from "../../main/workers/watchExecution";
import {
  WORKER_HANG_AFTER_MS,
  WorkerWatchdog,
} from "../../main/workers/WorkerWatchdog";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = `-> start

scene start
  HERO:
    The first beat.

  HERO:
    The beat that loops.

  HERO:
    The last beat.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));
const FIRST = lineOf("The first beat.");
const LOOPS = lineOf("The beat that loops.");
const LAST = lineOf("The last beat.");
/** The scene's own line, which no route or selection here asks for. */
const START = lineOf("scene start");

const at = (line: number) => ({
  uri: MAIN_URI,
  range: {
    start: { line, character: 4 },
    end: { line, character: 24 },
  },
});

/** STOP waits a frame between its steps, which this page does not draw. */
const framesForStop = (h: { overlay: HTMLElement }) => {
  const win = h.overlay.ownerDocument.defaultView as any;
  win.requestAnimationFrame ??= (callback: () => void) =>
    setTimeout(callback, 0);
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

/** Every display the page asks of the worker from now on, by line. */
const recordDisplays = (h: any) => {
  const lines: number[] = [];
  const request = h.link.request.bind(h.link);
  h.link.request = (type: any, params: any) => {
    if (type.method === DisplayPreviewMessage.method) {
      lines.push(params.line);
    }
    return request(type, params);
  };
  return lines;
};

describe("timing a stretch of story execution", () => {
  const watch = () => {
    let now = 0;
    const yields: (() => void)[] = [];
    const notices: number[] = [];
    const listener = watchExecution({
      now: () => now,
      afterYield: (callback) => yields.push(callback),
      notice: (_story, busyMs) => notices.push(busyMs),
    });
    const story = { state: { previousPointer: { path: null } } };
    return {
      /** A watch call `ms` after the last. */
      step(ms: number) {
        now += ms;
        listener(story);
      },
      /** The thread yields. */
      yieldThread() {
        for (const callback of yields.splice(0)) callback();
      },
      notices,
    };
  };

  it("reports a stretch once it has run past the notice, and again as it goes on", () => {
    const w = watch();
    w.step(0);
    w.step(BUSY_NOTICE_AFTER_MS - 1);
    expect(w.notices).toEqual([]);
    w.step(1);
    expect(w.notices).toEqual([BUSY_NOTICE_AFTER_MS]);
    w.step(BUSY_NOTICE_EVERY_MS - 1);
    expect(w.notices.length).toBe(1);
    w.step(1);
    expect(w.notices).toEqual([
      BUSY_NOTICE_AFTER_MS,
      BUSY_NOTICE_AFTER_MS + BUSY_NOTICE_EVERY_MS,
    ]);
  });

  it("starts again once the thread yields, so short stretches never add up", () => {
    const w = watch();
    for (let i = 0; i < 10; i++) {
      w.step(0);
      w.step(BUSY_NOTICE_AFTER_MS - 1);
      w.yieldThread();
    }
    expect(w.notices).toEqual([]);
  });
});

describe("the page's watchdog", () => {
  const connection = () => {
    const listeners = new Set<(e: MessageEvent) => void>();
    return {
      addEventListener: (_: string, l: (e: MessageEvent) => void) =>
        listeners.add(l),
      removeEventListener: (_: string, l: (e: MessageEvent) => void) =>
        listeners.delete(l),
      send(busyMs: number) {
        const data = WorkerBusyMessage.type.notification({
          busyMs,
          location: null,
          routingTo: null,
        });
        for (const l of [...listeners]) l({ data } as MessageEvent);
      },
      listeners,
    };
  };

  it("takes the worker for stuck once, when a stretch reaches the wait", () => {
    const c = connection();
    const hangs: number[] = [];
    new WorkerWatchdog(c as any, (busy) => hangs.push(busy.busyMs));
    c.send(BUSY_NOTICE_AFTER_MS);
    c.send(WORKER_HANG_AFTER_MS - 1);
    expect(hangs).toEqual([]);
    c.send(WORKER_HANG_AFTER_MS);
    c.send(WORKER_HANG_AFTER_MS + BUSY_NOTICE_EVERY_MS);
    expect(hangs).toEqual([WORKER_HANG_AFTER_MS]);
  });

  it("stops listening once disposed", () => {
    const c = connection();
    const watchdog = new WorkerWatchdog(c as any, () => {});
    expect(c.listeners.size).toBe(1);
    watchdog.dispose();
    expect(c.listeners.size).toBe(0);
  });
});

describe("the worker's notices", () => {
  /** Two watch calls on `story` in one run, `busyMs` apart. */
  const runFor = (story: any, busyMs: number) => {
    const now = vi.spyOn(performance, "now");
    try {
      now.mockReturnValue(1_000);
      executionWatch.listener!(story);
      now.mockReturnValue(1_000 + busyMs);
      executionWatch.listener!(story);
    } finally {
      now.mockRestore();
    }
  };

  const busyNotices = (h: any) =>
    h.toPage.filter((m: any) => m.method === WorkerBusyMessage.method);

  it("name the point a preview's route was headed for, and the line it ran", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      await h.select(LAST);
      runFor(h.workerState.gameState.game!.story, BUSY_NOTICE_AFTER_MS);
      await settle();
      const [notice] = busyNotices(h);
      expect(notice.params.busyMs).toBe(BUSY_NOTICE_AFTER_MS);
      expect(notice.params.routingTo).toEqual({ file: MAIN_URI, line: LAST });
      expect(notice.params.location?.uri).toBe(MAIN_URI);
    } finally {
      h.dispose();
    }
  }, 60_000);

  it("name no point for PLAY's game, which routes nowhere", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(FIRST);
      await h.controller.startGameAndApp();
      await settle();
      const running = h.playing();
      expect(running != null).toBe(true);
      runFor(running!.story, BUSY_NOTICE_AFTER_MS);
      await settle();
      const [notice] = busyNotices(h);
      expect(notice.params.routingTo).toBeNull();
      await h.controller.stopGame("quit");
    } finally {
      h.dispose();
    }
  }, 60_000);
});

describe("the page, when the worker is restarted", () => {
  it("ends PLAY that STOP was waiting on, and the preview returns", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(FIRST);
      await h.controller.startGameAndApp();
      await settle();
      expect(h.controller.playing).toBe(true);

      // The game runs into a loop; STOP gets no answer.
      h.stall();
      const stopped = h.controller.stopGame("quit");
      expect(await settlesWithin(stopped, 200)).toBe("waiting");

      await h.hang({
        busyMs: WORKER_HANG_AFTER_MS,
        location: at(LOOPS),
        routingTo: null,
      });
      expect(await settlesWithin(stopped, 2000)).toBe("settled");
      expect(h.controller.playing).toBe(false);
      const restarted = h.toEditor.find(
        (m) => m.method === GameWorkerRestartedMessage.method,
      );
      expect(restarted?.params.during).toBe("play");
      expect(restarted?.params.location).toEqual(at(LOOPS));
      expect(restarted?.params.message).toContain(`line ${LOOPS + 1}`);
      expect(
        h.toEditor.some((m) => m.method === GameExitedMessage.method),
      ).toBe(true);
      // The line PLAY stopped on is not selected: it may be the loop.
      expect(h.workspace.selections).toEqual([]);

      // The new worker compiles, and the preview shows the author's line.
      await h.compile();
      expect(h.overlay.textContent).toContain("The first beat.");
    } finally {
      h.dispose();
    }
  }, 60_000);

  it("ends PLAY the author had not stopped, as a run that raised an error", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(FIRST);
      await h.controller.startGameAndApp();
      await settle();
      h.stall();
      await h.hang({
        busyMs: WORKER_HANG_AFTER_MS,
        location: at(LOOPS),
        routingTo: null,
      });
      await settle(40);
      expect(h.controller.playing).toBe(false);
      const exited = h.toEditor.find(
        (m) => m.method === GameExitedMessage.method,
      );
      expect(exited?.params.reason).toBe("error");
      expect(exited?.params.error?.location).toEqual(at(LOOPS));
      expect(h.workspace.selections).toEqual([]);
    } finally {
      h.dispose();
    }
  }, 60_000);

  it("gives up a stopped preview whose route never yields, and does not ask for it again", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      await h.select(FIRST);
      expect(h.overlay.textContent).toContain("The first beat.");

      // The author moves to a line whose route runs into a loop.
      h.stall();
      const program = h.controller._program!;
      h.controller._options!.startFrom = { file: MAIN_URI, line: LOOPS };
      const previewing = h.controller.updatePreview(program, MAIN_URI, LOOPS);
      expect(await settlesWithin(previewing, 200)).toBe("waiting");
      await h.hang({
        busyMs: WORKER_HANG_AFTER_MS,
        location: at(LOOPS),
        routingTo: { file: MAIN_URI, line: LOOPS },
      });
      expect(await previewing).toBe(false);
      const restarted = h.toEditor.find(
        (m) => m.method === GameWorkerRestartedMessage.method,
      );
      expect(restarted?.params.during).toBe("preview");

      // The new worker compiles; the page does not display the point that
      // stopped the worker, although it is still the author's line.
      const displays = recordDisplays(h);
      await h.compile();
      expect(displays).not.toContain(LOOPS);
      expect(
        await h.controller.updatePreview(
          h.controller._program!,
          MAIN_URI,
          LOOPS,
        ),
      ).toBe(false);
      expect(displays).not.toContain(LOOPS);

      // Any other line displays.
      await h.select(LAST);
      expect(displays).toContain(LAST);
      expect(h.overlay.textContent).toContain("The last beat.");

      // Once the project changes, the point is the preview's again.
      h.workspace.filesRevision += 1;
      expect(h.workspace.isSetAside({ file: MAIN_URI, line: LOOPS })).toBe(
        false,
      );
    } finally {
      h.dispose();
    }
  }, 60_000);

  it("pauses the preview until the script changes once a second route runs into the loop", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    try {
      await h.compile();
      await h.select(FIRST);
      for (const line of [LOOPS, LAST]) {
        h.stall();
        await h.hang({
          busyMs: WORKER_HANG_AFTER_MS,
          location: at(LOOPS),
          routingTo: { file: MAIN_URI, line },
        });
        await h.compile();
      }
      const messages = h.toEditor
        .filter((m) => m.method === GameWorkerRestartedMessage.method)
        .map((m) => m.params.message);
      expect(messages[0]).toContain("will not show the line you were on");
      expect(messages[1]).toContain("paused until the script changes");

      // No line displays, not even one before the loop that nothing set
      // aside on its own.
      const displays = recordDisplays(h);
      expect(h.workspace.isSetAside({ file: MAIN_URI, line: START })).toBe(
        true,
      );
      expect(
        await h.controller.updatePreview(
          h.controller._program!,
          MAIN_URI,
          START,
        ),
      ).toBe(false);
      expect(displays).toEqual([]);

      // Until the script changes.
      h.workspace.documentsRevision += 1;
      await h.select(FIRST);
      expect(displays).toContain(FIRST);
      expect(h.overlay.textContent).toContain("The first beat.");
    } finally {
      h.dispose();
    }
  }, 60_000);

  it("holds PLAY asked for while the worker restarts until the new worker's program arrives", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(FIRST);
      h.stall();
      await h.hang({
        busyMs: WORKER_HANG_AFTER_MS,
        location: at(LOOPS),
        routingTo: { file: MAIN_URI, line: LOOPS },
      });
      // The restarted worker has compiled nothing yet, and holds no program.
      const played = h.controller.startGameAndApp();
      expect(await settlesWithin(played, 200)).toBe("waiting");
      await h.compile();
      expect(await played).toBe(true);
      expect(h.controller.playing).toBe(true);
      await h.controller.stopGame("quit");
    } finally {
      h.dispose();
    }
  }, 60_000);

  it("holds PLAY only once, for its bound, when the restarted worker delivers no program", async () => {
    const h = await createPlayerHarness({
      files: [{ uri: MAIN_URI, text: SOURCE }],
      startFrom: { file: MAIN_URI, line: FIRST },
    });
    framesForStop(h);
    try {
      await h.compile();
      await h.select(FIRST);
      h.controller._programAfterRestartWaitMs = 100;
      h.stall();
      await h.hang({
        busyMs: WORKER_HANG_AFTER_MS,
        location: at(LOOPS),
        routingTo: { file: MAIN_URI, line: LOOPS },
      });
      // The restarted worker never compiles: PLAY waits out the bound.
      const first = h.controller.startGameAndApp();
      expect(await settlesWithin(first, 50)).toBe("waiting");
      expect(await settlesWithin(first, 2000)).toBe("settled");
      expect(h.controller._programAfterRestart).toBeUndefined();
      // The next PLAY does not wait again.
      h.controller._programAfterRestartWaitMs = 60_000;
      expect(
        await settlesWithin(h.controller.startGameAndApp(), 2000),
      ).toBe("settled");
    } finally {
      h.dispose();
    }
  }, 60_000);
});
