// #679 — the player's workspace restarts its worker when the worker reports a
// story that has run without yielding for longer than the page waits. The
// worker is a stand-in: it keeps the port the workspace hands it, through
// which the test sends what a stuck worker still sends, its busy notices, and
// answers nothing.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerBusyMessage } from "../../main/workers/messages/WorkerBusyMessage";
import type { WorkerHang } from "../../main/workers/WorkerDisplayWorkspace";
import { WORKER_HANG_AFTER_MS } from "../../main/workers/WorkerWatchdog";

// The worker's own module installs a worker on whatever loads it.
vi.mock("../../main/workers/workspace.worker", () => ({ default: "" }));

const { installWorkspaceWorker } = await import(
  "../../main/workers/installWorkspaceWorker"
);

const MAIN = "file:///local/main.sd";

/** A worker that keeps the port it is handed and answers nothing. */
class StandInWorker {
  static made: StandInWorker[] = [];
  port?: MessagePort;
  terminated = false;
  onerror: unknown;
  constructor() {
    StandInWorker.made.push(this);
  }
  postMessage(_message: unknown, options?: { transfer?: Transferable[] }) {
    const port = options?.transfer?.[0];
    if (port) {
      this.port = port as MessagePort;
    }
  }
  addEventListener() {}
  removeEventListener() {}
  terminate() {
    this.terminated = true;
  }
}

const busy = (
  busyMs: number,
  runningLine: number | null,
  routingLine: number | null,
) =>
  WorkerBusyMessage.type.notification({
    busyMs,
    location:
      runningLine == null
        ? null
        : {
            uri: MAIN,
            range: {
              start: { line: runningLine, character: 0 },
              end: { line: runningLine, character: 9 },
            },
          },
    routingTo: routingLine == null ? null : { file: MAIN, line: routingLine },
  });

const until = async (done: () => boolean) => {
  for (let i = 0; i < 200 && !done(); i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const selection = (line: number) => ({
  textDocument: { uri: MAIN },
  selectedRange: {
    start: { line, character: 0 },
    end: { line, character: 0 },
  },
  docChanged: false,
  userEvent: true,
});

const g = globalThis as any;
const originals = { Worker: g.Worker, createObjectURL: URL.createObjectURL };

beforeEach(() => {
  StandInWorker.made = [];
  g.Worker = StandInWorker;
  URL.createObjectURL = () => "blob:worker";
});

afterEach(() => {
  g.Worker = originals.Worker;
  URL.createObjectURL = originals.createObjectURL;
});

const createWorkspace = () => {
  const host = {
    addEventListener() {},
    removeEventListener() {},
    sendResponse() {},
    request: () => new Promise(() => {}),
    sendRequest: () => new Promise(() => {}),
  };
  const { workspace } = installWorkspaceWorker(host as any);
  const hangs: WorkerHang[] = [];
  workspace.addWorkerHangListener((hang) => hangs.push(hang));
  return { workspace, hangs };
};

describe("the player's workspace, when its worker stops answering (#679)", () => {
  it("restarts the worker once a story has run past the wait, and not before", async () => {
    const { workspace, hangs } = createWorkspace();
    const stuck = StandInWorker.made[0]!;
    expect(stuck.port).toBeDefined();

    // A stretch under the wait is a long route, not a hang.
    stuck.port!.postMessage(busy(WORKER_HANG_AFTER_MS - 1, 3, 15));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hangs).toEqual([]);
    expect(stuck.terminated).toBe(false);

    stuck.port!.postMessage(busy(WORKER_HANG_AFTER_MS, 3, 15));
    await until(() => hangs.length > 0);
    expect(hangs.length).toBe(1);
    expect(hangs[0]!.busyMs).toBe(WORKER_HANG_AFTER_MS);
    expect(hangs[0]!.location?.range.start.line).toBe(3);
    expect(stuck.terminated).toBe(true);
    expect(StandInWorker.made.length).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The game link talks to the new worker.
    expect((workspace.gameLink as any)._connection).toBe(
      (workspace as any)._compilerChannelConnection,
    );

    // The old worker is gone and heard no more; the new one is watched.
    stuck.port!.postMessage(busy(WORKER_HANG_AFTER_MS * 2, 3, 15));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(hangs.length).toBe(1);
    StandInWorker.made[1]!.port!.postMessage(busy(WORKER_HANG_AFTER_MS, 7, 20));
    await until(() => hangs.length > 1);
    expect(hangs.length).toBe(2);
    expect(StandInWorker.made[1]!.terminated).toBe(true);
  });

  it("sets aside the point it was routing to, the author's selection and the line it was running, until the script changes", async () => {
    const { workspace, hangs } = createWorkspace();
    // The author has moved on to line 17 while the worker routes to line 15.
    (workspace as any)._documentSelected = { file: MAIN, line: 17 };
    StandInWorker.made[0]!.port!.postMessage(busy(WORKER_HANG_AFTER_MS, 3, 15));
    await until(() => hangs.length > 0);

    expect(workspace.isSetAside({ file: MAIN, line: 15 })).toBe(true);
    expect(workspace.isSetAside({ file: MAIN, line: 17 })).toBe(true);
    expect(workspace.isSetAside({ file: MAIN, line: 3 })).toBe(true);
    expect(workspace.isSetAside({ file: MAIN, line: 12 })).toBe(false);

    // A selection of it is the author's, but is not routed to: it answers
    // at once, although the new worker has answered nothing yet.
    expect(await workspace.selectTextDocument(selection(15))).toEqual(
      selection(15),
    );
    expect((workspace as any).compileStartFrom()).toBeUndefined();

    // An edit lets it go.
    void workspace.changeTextDocument({
      textDocument: { uri: MAIN, version: 2 },
      contentChanges: [{ text: "BOB:\n  Fixed.\n" }],
    });
    expect(workspace.isSetAside({ file: MAIN, line: 15 })).toBe(false);
    expect((workspace as any).compileStartFrom()).toEqual({
      file: MAIN,
      line: 15,
    });
  });

  it("withholds every point once a second route in the same revision stops the worker", async () => {
    const { workspace, hangs } = createWorkspace();
    StandInWorker.made[0]!.port!.postMessage(busy(WORKER_HANG_AFTER_MS, 3, 15));
    await until(() => hangs.length > 0);
    expect(hangs[0]!.previewWithheld).toBe(false);
    expect(workspace.isSetAside({ file: MAIN, line: 30 })).toBe(false);

    // The loop lies on the way to line 30 too.
    StandInWorker.made[1]!.port!.postMessage(busy(WORKER_HANG_AFTER_MS, 3, 30));
    await until(() => hangs.length > 1);
    expect(hangs[1]!.previewWithheld).toBe(true);
    for (const line of [0, 12, 30, 45]) {
      expect(workspace.isSetAside({ file: MAIN, line })).toBe(true);
    }

    // Until the script changes.
    void workspace.changeTextDocument({
      textDocument: { uri: MAIN, version: 2 },
      contentChanges: [{ text: "BOB:\n  Fixed.\n" }],
    });
    expect(workspace.isSetAside({ file: MAIN, line: 45 })).toBe(false);
  });
});
