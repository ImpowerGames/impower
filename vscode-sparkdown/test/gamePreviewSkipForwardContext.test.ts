import { describe, expect, it, vi } from "vitest";
import type { FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({
  vscode: null as unknown as FakeVscode,
  terminate: [] as (() => void)[],
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  state.vscode = fakeVscode();
  const disposable = { dispose() {} };
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
    commands: {
      ...state.vscode.commands,
      registerCommand: () => disposable,
    },
    debug: {
      activeDebugSession: undefined,
      onDidTerminateDebugSession: (listener: () => void) => {
        state.terminate.push(listener);
        return disposable;
      },
    },
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

const history = (canRollForward: boolean) => ({
  canRollBack: true,
  canRollForward,
  behindLatest: canRollForward,
});

const open = async () => {
  const { SparkdownDebugManager } =
    await import("../src/managers/SparkdownDebugManager");
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  state.vscode.commands.executed.length = 0;
  state.terminate.length = 0;
  const context = {
    extensionUri: "ext",
    storageUri: { path: "/storage/workspace-1" },
    workspaceState: memento(),
    globalState: memento(),
    subscriptions: [],
  } as any;
  SparkdownDebugManager.activate(context);
  const manager = new SparkdownPreviewGamePanelManager();
  let receive!: (message: unknown) => Promise<void>;
  const panel = {
    webview: {
      cspSource: "csp",
      html: "",
      asWebviewUri: (uri: { toString(): string }) => uri,
      postMessage: (message: any) => {
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
  const send = (method: string, params: unknown) =>
    receive({ jsonrpc: "2.0", method, params });
  const canSkipForward = () =>
    state.vscode.commands.executed
      .filter(
        (c) =>
          c.command === "setContext" &&
          c.args[0] === "sparkdown.debug.canSkipForward",
      )
      .map((c) => c.args[1]);
  return { send, canSkipForward };
};

describe("the Game Preview's Skip Forward enablement", () => {
  it("follows the run's history from the player's executed, rolled and stepped messages", async () => {
    const preview = await open();
    await preview.send("game/executed", { history: history(false) });
    expect(preview.canSkipForward()).toEqual([]);
    await preview.send("game/rolled", { history: history(true) });
    expect(preview.canSkipForward()).toEqual([true]);
    await preview.send("game/stepped", { history: history(true) });
    expect(preview.canSkipForward()).toEqual([true]);
    await preview.send("game/rolled", { history: history(false) });
    expect(preview.canSkipForward()).toEqual([true, false]);
    await preview.send("game/stepped", { history: history(true) });
    await preview.send("game/executed", { history: history(false) });
    expect(preview.canSkipForward()).toEqual([true, false, true, false]);
  });

  it("ignores a message without history and turns off when the run exits", async () => {
    const preview = await open();
    await preview.send("game/rolled", { history: history(true) });
    await preview.send("game/executed", {});
    expect(preview.canSkipForward()).toEqual([true]);
    await preview.send("game/exited", { reason: "quit" });
    expect(preview.canSkipForward()).toEqual([true, false]);
  });
});
