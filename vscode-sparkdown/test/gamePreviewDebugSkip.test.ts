import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({
  vscode: null as unknown as FakeVscode,
  debug: { activeDebugSession: undefined as unknown },
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  state.vscode = fakeVscode();
  return {
    ...state.vscode,
    ViewColumn: { Two: 2 },
    Uri: {
      parse: (uri: string) => ({ toString: () => uri }),
      joinPath: (base: { path: string }, ...parts: string[]) => {
        const path = [base.path, ...parts].join("/");
        return { path, toString: () => `file://${path}` };
      },
    },
    debug: state.debug,
    window: {
      ...state.vscode.window,
      showErrorMessage: () => Promise.resolve(undefined),
    },
  };
});
vi.mock("../src/utils/getWorkspaceFiles", () => ({
  getWorkspaceFiles: async () => [],
}));
vi.mock("../src/utils/getWorkspaceFileWatchers", () => ({
  getWorkspaceFileWatchers: () => [],
}));

const CONNECTED = {
  jsonrpc: "2.0",
  method: "preview/connected",
  params: { type: "game" },
};

const memento = () => {
  const values = new Map<string, unknown>();
  return {
    get: (key: string, fallback?: unknown) =>
      values.has(key) ? values.get(key) : fallback,
    update: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
};

const session = (
  id: string,
  answer: (command: string, args: unknown) => Promise<unknown> = async () => ({
    moved: true,
  }),
  { type = "game", noDebug = false } = {},
) => {
  const requests: [string, unknown][] = [];
  return {
    id,
    type,
    name: "Debug File",
    configuration: noDebug ? { noDebug } : {},
    requests,
    customRequest: (command: string, args: unknown) => {
      requests.push([command, args]);
      return answer(command, args);
    },
  };
};

const open = async () => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  const context = {
    extensionUri: "ext",
    storageUri: { path: "/storage/workspace-1" },
    workspaceState: memento(),
    globalState: memento(),
    subscriptions: [],
  } as any;
  const manager = new SparkdownPreviewGamePanelManager();
  const posted: any[] = [];
  let receive!: (message: unknown) => Promise<void>;
  const panel = {
    webview: {
      cspSource: "csp",
      html: "",
      asWebviewUri: (uri: { toString(): string }) => uri,
      postMessage: (message: any) => {
        posted.push(message);
        if (
          message?.id != null &&
          message.method &&
          !("result" in message) &&
          !("error" in message)
        ) {
          queueMicrotask(() =>
            receive({
              jsonrpc: "2.0",
              method: message.method,
              id: message.id,
              result: {},
            }),
          );
        }
        return Promise.resolve(true);
      },
      onDidReceiveMessage: (listener: (message: unknown) => Promise<void>) => {
        receive = listener;
        return { dispose: () => {} };
      },
    },
    onDidDispose: () => ({ dispose: () => {} }),
  };
  await manager.initializePanel(panel as any, context, undefined);
  let nextId = 0;
  const skip = async (direction: -1 | 1) => {
    const id = `player-${nextId++}`;
    await receive({
      jsonrpc: "2.0",
      method: "preview/skipBeat",
      id,
      params: { direction },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return posted.find((m) => m.id === id && ("result" in m || "error" in m));
  };
  const controls = () =>
    posted
      .filter((m) => m.method === "preview/setControls")
      .map((m) => m.params);
  return { manager, posted, receive: (m: unknown) => receive(m), skip, controls };
};

const activate = (run: unknown) => {
  state.debug.activeDebugSession = run;
};

describe("the Game Preview's skip buttons during a debug run", () => {
  beforeEach(() => {
    activate(undefined);
  });

  it("stay off and leave a skip unanswered with no debug session", async () => {
    const preview = await open();
    await preview.receive(CONNECTED);
    expect(preview.controls()).toEqual([{ skipButtons: false }]);
    expect(await preview.skip(-1)).toBeUndefined();
  });

  it("turn on for the active debug session and roll its run", async () => {
    const preview = await open();
    const run = session("s1");
    activate(run);
    preview.manager.syncDebugSession();
    expect(preview.controls()).toEqual([{ skipButtons: true }]);
    expect((await preview.skip(-1))?.result).toEqual({ moved: true });
    expect((await preview.skip(1))?.result).toEqual({ moved: true });
    expect(run.requests).toEqual([
      ["sparkdown/rollBack", { to: "beat" }],
      ["sparkdown/rollForward", { to: "beat" }],
    ]);
  });

  it("are restated to a preview that reconnects mid-run", async () => {
    const preview = await open();
    activate(session("s1"));
    preview.manager.syncDebugSession();
    await preview.receive(CONNECTED);
    expect(preview.controls()).toEqual([
      { skipButtons: true },
      { skipButtons: true },
    ]);
  });

  it("answer moved false when the session refuses the roll", async () => {
    const preview = await open();
    activate(
      session("s1", async () => {
        throw new Error("Nothing to go back to.");
      }),
    );
    preview.manager.syncDebugSession();
    expect((await preview.skip(-1))?.result).toEqual({ moved: false });
  });

  it("roll the session the author selects, not the last one started", async () => {
    const preview = await open();
    const first = session("s1");
    const second = session("s2");
    activate(first);
    preview.manager.syncDebugSession();
    activate(second);
    preview.manager.syncDebugSession();
    activate(first);
    preview.manager.syncDebugSession();
    await preview.skip(-1);
    expect(first.requests).toEqual([["sparkdown/rollBack", { to: "beat" }]]);
    expect(second.requests).toEqual([]);
  });

  it("stay on when another session ends and the debugged run is still active", async () => {
    const preview = await open();
    const first = session("s1");
    activate(first);
    preview.manager.syncDebugSession();
    preview.manager.syncDebugSession(session("s2") as any);
    expect(preview.controls()).toEqual([{ skipButtons: true }]);
    expect((await preview.skip(1))?.result).toEqual({ moved: true });
  });

  it("turn off when the active session is a run without debugging or another debugger's", async () => {
    const preview = await open();
    const debugged = session("s1");
    activate(debugged);
    preview.manager.syncDebugSession();
    activate(session("s2", undefined, { noDebug: true }));
    preview.manager.syncDebugSession();
    expect(preview.controls()).toEqual([
      { skipButtons: true },
      { skipButtons: false },
    ]);
    expect(await preview.skip(-1)).toBeUndefined();
    activate(session("s3", undefined, { type: "node" }));
    preview.manager.syncDebugSession();
    expect(await preview.skip(-1)).toBeUndefined();
    expect(debugged.requests).toEqual([]);
  });

  it("turn off when the active session ends, and the next skip goes unanswered", async () => {
    const preview = await open();
    const run = session("s1");
    activate(run);
    preview.manager.syncDebugSession();
    preview.manager.syncDebugSession(run as any);
    expect(preview.controls()).toEqual([
      { skipButtons: true },
      { skipButtons: false },
    ]);
    expect(await preview.skip(1)).toBeUndefined();
    expect(run.requests).toEqual([]);
  });
});
