import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  kind: 2,
  themeListeners: [] as (() => void)[],
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  const vscode = fakeVscode();
  const disposable = () => ({ dispose: () => {} });
  return {
    ...vscode,
    commands: { ...vscode.commands, registerCommand: disposable },
    ConfigurationTarget: { Global: 1, Workspace: 2 },
    ViewColumn: { Two: 2 },
    Uri: {
      parse: (uri: string) => ({ toString: () => uri }),
      joinPath: (base: { path: string }, ...parts: string[]) => {
        const path = [base.path, ...parts].join("/");
        return { path, toString: () => `file://${path}` };
      },
    },
    debug: { activeDebugSession: undefined },
    window: {
      ...vscode.window,
      get activeColorTheme() {
        return { kind: state.kind };
      },
      onDidChangeActiveColorTheme: (listener: () => void) => {
        state.themeListeners.push(listener);
        return disposable();
      },
      showErrorMessage: () => Promise.resolve(undefined),
      onDidChangeTextEditorVisibleRanges: disposable,
      registerWebviewPanelSerializer: disposable,
    },
    workspace: {
      ...vscode.workspace,
      onDidChangeConfiguration: disposable,
      getConfiguration: () => ({ get: () => undefined, toJSON: () => ({}) }),
    },
  };
});
vi.mock("../src/utils/getWorkspaceFiles", () => ({
  getWorkspaceFiles: async () => [],
}));
vi.mock("../src/utils/getWorkspaceFileWatchers", () => ({
  getWorkspaceFileWatchers: () => [],
}));

const KIND = { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 } as const;

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

const open = async () => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  const manager = SparkdownPreviewGamePanelManager.instance;
  const posted: any[] = [];
  let receive!: (message: unknown) => Promise<void>;
  const panel = {
    webview: {
      cspSource: "csp",
      html: "",
      asWebviewUri: (uri: { toString(): string }) => uri,
      postMessage: (message: any) => {
        posted.push(message);
        if (message?.id != null && message.method && !("result" in message)) {
          queueMicrotask(() =>
            receive({ jsonrpc: "2.0", method: message.method, id: message.id, result: {} }),
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
  const context = {
    extensionUri: "ext",
    storageUri: { path: "/storage/workspace-1" },
    workspaceState: memento(),
    globalState: memento(),
    subscriptions: [],
  } as any;
  await manager.initializePanel(panel as any, context, undefined);
  const sent = () => posted.filter((m) => m.method === "game/setSimulatedColorScheme");
  return {
    receive: (m: unknown) => receive(m),
    sent,
    schemes: () => sent().map((m) => m.params.color_scheme),
  };
};

const connected = { jsonrpc: "2.0", method: "preview/connected", params: { type: "game" } };

describe("the Game Preview simulates the device's scheme from VS Code's theme (#2062)", () => {
  beforeEach(() => {
    state.kind = KIND.Dark;
    state.themeListeners = [];
  });

  it.each([
    [KIND.Dark, "dark"],
    [KIND.HighContrast, "dark"],
    [KIND.Light, "light"],
    [KIND.HighContrastLight, "light"],
  ])("theme kind %s sends %s when the preview connects", async (kind, scheme) => {
    state.kind = kind;
    const preview = await open();
    await preview.receive(connected);
    expect(preview.schemes()).toEqual([scheme]);
    expect(preview.sent().map((m) => m.params)).toEqual([{ color_scheme: scheme }]);
  });

  it("sends the scheme again when a run starts", async () => {
    state.kind = KIND.Light;
    const preview = await open();
    await preview.receive({ jsonrpc: "2.0", method: "game/started" });
    expect(preview.schemes()).toEqual(["light"]);
  });

  it("sends the new scheme when the VS Code theme changes", async () => {
    const { activatePreviewGamePanel } = await import("../src/utils/activatePreviewGamePanel");
    await activatePreviewGamePanel({ subscriptions: [] } as any);
    expect(state.themeListeners).toHaveLength(1);
    const preview = await open();
    await preview.receive(connected);
    state.kind = KIND.Light;
    state.themeListeners.forEach((listener) => listener());
    state.kind = KIND.Dark;
    state.themeListeners.forEach((listener) => listener());
    expect(preview.schemes()).toEqual(["dark", "light", "dark"]);
  });
});
