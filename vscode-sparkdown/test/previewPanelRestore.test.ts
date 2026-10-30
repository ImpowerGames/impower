import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDocument, FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({
  vscode: null as unknown as FakeVscode,
  openable: new Map<string, unknown>(),
  held: new Map<string, { opened: () => void; released: Promise<void> }>(),
  created: undefined as unknown,
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  state.vscode = fakeVscode();
  return {
    ...state.vscode,
    ViewColumn: { Two: 2 },
    Uri: {
      parse: (uri: string) => ({ toString: () => uri }),
      joinPath: (base: unknown, ...parts: string[]) => ({ base, parts }),
    },
    workspace: {
      ...state.vscode.workspace,
      get textDocuments() {
        return state.vscode.workspace.textDocuments;
      },
      openTextDocument: async (uri: { toString(): string }) => {
        const hold = state.held.get(uri.toString());
        if (hold) {
          hold.opened();
          await hold.released;
        }
        const document = state.openable.get(uri.toString());
        if (!document) {
          throw new Error(`cannot open ${uri.toString()}`);
        }
        return document;
      },
    },
    window: {
      ...state.vscode.window,
      get activeTextEditor() {
        return state.vscode.window.activeTextEditor;
      },
      get visibleTextEditors() {
        return state.vscode.window.visibleTextEditors;
      },
      showErrorMessage: () => Promise.resolve(undefined),
      createWebviewPanel: () => state.created,
      tabGroups: { activeTabGroup: { activeTab: undefined } },
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

const restoredPanel = () => {
  const posted: any[] = [];
  let receive: ((message: unknown) => Promise<void>) | undefined;
  const panel = {
    disposed: false,
    dispose() {
      panel.disposed = true;
    },
    webview: {
      cspSource: "csp",
      html: "",
      asWebviewUri: (uri: { toString(): string }) => uri,
      postMessage: (message: any) => {
        posted.push(message);
        if (message?.id != null && message.method) {
          queueMicrotask(() =>
            receive?.({
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
  const start = async () => {
    expect(receive, "the restored panel listens to its webview").toBeDefined();
    await Promise.all([receive!({}), receive!(CONNECTED)]);
  };
  const initializations = () =>
    posted.filter((m) => m.method === "initialize" && m.id != null);
  return { panel, posted, start, initializations };
};

const freshManager = async () => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  (SparkdownPreviewGamePanelManager as any)._instance = undefined;
  return SparkdownPreviewGamePanelManager.instance;
};

const extensionContext = {
  extensionUri: "ext",
  globalState: {
    get: (_key: string, fallback?: unknown) => fallback,
    update: () => Promise.resolve(),
  },
} as any;

const deserialize = async (panel: unknown, saved: unknown) => {
  const { SparkdownPreviewGamePanelSerializer } =
    await import("../src/managers/SparkdownPreviewGamePanelSerializer");
  await new SparkdownPreviewGamePanelSerializer(
    extensionContext,
  ).deserializeWebviewPanel(panel as any, saved as any);
};

const restore = async (panel: unknown, saved: unknown) => {
  const manager = await freshManager();
  await deserialize(panel, saved);
  return manager;
};

const hold = (uri: string) => {
  let opened!: () => void;
  let release!: () => void;
  const opening = new Promise<void>((resolve) => (opened = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));
  state.held.set(uri, { opened, released });
  return { opening, release };
};

const showInEditor = async (doc: FakeDocument) => {
  const { editor, Position, Selection } = await import("./fakeVscode");
  const at = new Position(0, 0);
  const shown = editor(doc, [new Selection(at, at)]);
  state.vscode.window.activeTextEditor = shown;
  state.vscode.window.visibleTextEditors = [shown];
  state.vscode.workspace.textDocuments.push(doc);
};

beforeEach(async () => {
  await import("vscode");
  state.openable = new Map();
  state.held = new Map();
  state.created = undefined;
  state.vscode.window.activeTextEditor = undefined;
  state.vscode.window.visibleTextEditors = [];
  state.vscode.workspace.textDocuments.length = 0;
});

describe("restoring the Game Preview when the workspace reopens", () => {
  it("starts a restored panel that saved no state, with the active script", async () => {
    const { document } = await import("./fakeVscode");
    await showInEditor(document("file:///project/main.sd", "Hello."));
    const { panel, start, initializations } = restoredPanel();

    const manager = await restore(panel, undefined);
    await start();

    expect(panel.disposed).toBe(false);
    expect(panel.webview.html).toContain("<spark-web-player");
    expect(manager.panel).toBe(panel);
    expect(initializations()).toHaveLength(1);
    expect(initializations()[0].params.initializationOptions.uri).toBe(
      "file:///project/main.sd",
    );
    expect(manager.connected).toBe(true);
  });

  it("starts a restored panel that saved state without a script", async () => {
    const { panel, start, initializations } = restoredPanel();

    const manager = await restore(panel, {
      textDocument: { uri: "" },
      canvasHeight: 240,
    });
    await start();

    expect(panel.disposed).toBe(false);
    expect(initializations()).toHaveLength(1);
    expect(manager.connected).toBe(true);
  });

  it("resumes the script the restored panel saved", async () => {
    const { document } = await import("./fakeVscode");
    await showInEditor(document("file:///project/other.sd", "Other."));
    state.openable.set(
      "file:///project/main.sd",
      document("file:///project/main.sd", "Hello."),
    );
    const { panel, posted, start, initializations } = restoredPanel();

    await restore(panel, {
      textDocument: { uri: "file:///project/main.sd" },
      canvasHeight: 240,
    });
    await start();

    expect(initializations()).toHaveLength(1);
    expect(initializations()[0].params.initializationOptions.uri).toBe(
      "file:///project/main.sd",
    );
    const resizes = posted.filter((m) => m.method === "game/resize");
    expect(resizes.map((m) => m.params.height)).toEqual([240]);
  });

  it("closes a second restored Game Preview rather than start both", async () => {
    const { document } = await import("./fakeVscode");
    await showInEditor(document("file:///project/main.sd", "Hello."));
    const first = restoredPanel();
    const second = restoredPanel();

    const manager = await restore(first.panel, undefined);
    await deserialize(second.panel, undefined);
    await first.start();

    expect(second.panel.disposed).toBe(true);
    expect(second.posted).toEqual([]);
    expect(first.panel.disposed).toBe(false);
    expect(manager.panel).toBe(first.panel);
    expect(first.initializations()).toHaveLength(1);
    expect(manager.connected).toBe(true);
  });

  it("closes a restored Game Preview that another restore overtook while its script was opened", async () => {
    const { document } = await import("./fakeVscode");
    await showInEditor(document("file:///project/main.sd", "Hello."));
    state.openable.set(
      "file:///project/saved.sd",
      document("file:///project/saved.sd", "Saved."),
    );
    const { opening, release } = hold("file:///project/saved.sd");
    const first = restoredPanel();
    const second = restoredPanel();

    const manager = await freshManager();
    const restoring = deserialize(first.panel, {
      textDocument: { uri: "file:///project/saved.sd" },
    });
    await opening;
    await deserialize(second.panel, undefined);
    release();
    await restoring;
    await second.start();

    expect(first.panel.disposed).toBe(true);
    expect(first.posted).toEqual([]);
    expect(second.panel.disposed).toBe(false);
    expect(manager.panel).toBe(second.panel);
    expect(second.initializations()).toHaveLength(1);
    expect(second.initializations()[0].params.initializationOptions.uri).toBe(
      "file:///project/main.sd",
    );
    expect(manager.connected).toBe(true);
  });

  it("closes a restored Game Preview that Preview Game overtook while its script was opened", async () => {
    const { document } = await import("./fakeVscode");
    await showInEditor(document("file:///project/main.sd", "Hello."));
    state.openable.set(
      "file:///project/saved.sd",
      document("file:///project/saved.sd", "Saved."),
    );
    const { opening, release } = hold("file:///project/saved.sd");
    const restored = restoredPanel();
    const opened = restoredPanel();
    state.created = opened.panel;

    const manager = await freshManager();
    const restoring = deserialize(restored.panel, {
      textDocument: { uri: "file:///project/saved.sd" },
    });
    await opening;
    await manager.showPanel(
      extensionContext,
      state.vscode.window.activeTextEditor.document,
    );
    release();
    await restoring;
    await opened.start();

    expect(restored.panel.disposed).toBe(true);
    expect(restored.posted).toEqual([]);
    expect(manager.panel).toBe(opened.panel);
    expect(opened.initializations()).toHaveLength(1);
    expect(manager.connected).toBe(true);
  });

  it("starts with the active script when the saved one cannot be opened", async () => {
    const { document } = await import("./fakeVscode");
    await showInEditor(document("file:///project/main.sd", "Hello."));
    const { panel, start, initializations } = restoredPanel();

    await restore(panel, {
      textDocument: { uri: "file:///project/deleted.sd" },
    });
    await start();

    expect(panel.disposed).toBe(false);
    expect(initializations()).toHaveLength(1);
    expect(initializations()[0].params.initializationOptions.uri).toBe(
      "file:///project/main.sd",
    );
  });
});
