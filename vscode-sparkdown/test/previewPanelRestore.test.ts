// How a Game Preview that VS Code restores when a workspace reopens starts its
// player (#1886). VS Code hands the extension's serializer the panel and the
// state the webview last saved, which may be none at all. The serializer
// initialized the panel only from a saved document, which the webview no
// longer saved, so a restored panel was given no content and stayed black.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDocument, FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({
  vscode: null as unknown as FakeVscode,
  /** The documents `openTextDocument` can open, by uri. */
  openable: new Map<string, unknown>(),
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

/** A panel VS Code restored, recording what it is sent and whether it was
 *  closed, whose player answers each request. */
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
  /** The player in the restored webview loads and mounts, as on a cold
   *  start; resolves once the panel has handled both. */
  const start = async () => {
    expect(receive, "the restored panel listens to its webview").toBeDefined();
    await Promise.all([receive!({}), receive!(CONNECTED)]);
  };
  const initializations = () =>
    posted.filter((m) => m.method === "initialize" && m.id != null);
  return { panel, posted, start, initializations };
};

const restore = async (panel: unknown, saved: unknown) => {
  const { SparkdownPreviewGamePanelSerializer } =
    await import("../src/managers/SparkdownPreviewGamePanelSerializer");
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  // A fresh manager each time, as after VS Code starts the extension.
  (SparkdownPreviewGamePanelManager as any)._instance = undefined;
  const serializer = new SparkdownPreviewGamePanelSerializer({
    extensionUri: "ext",
  } as any);
  await serializer.deserializeWebviewPanel(panel as any, saved as any);
  return SparkdownPreviewGamePanelManager.instance;
};

/** Show `doc` in the active editor, with the cursor on its first line. */
const showInEditor = async (doc: FakeDocument) => {
  const { editor, Position, Selection } = await import("./fakeVscode");
  const at = new Position(0, 0);
  const shown = editor(doc, [new Selection(at, at)]);
  state.vscode.window.activeTextEditor = shown;
  state.vscode.window.visibleTextEditors = [shown];
  state.vscode.workspace.textDocuments.push(doc);
};

beforeEach(async () => {
  // Loads the mock, which creates the fake.
  await import("vscode");
  state.openable = new Map();
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
    // A workspace saved while the bug left a black tab beside one opened
    // with `Sparkdown: Preview Game` restores two.
    const { document } = await import("./fakeVscode");
    await showInEditor(document("file:///project/main.sd", "Hello."));
    const first = restoredPanel();
    const second = restoredPanel();

    const manager = await restore(first.panel, undefined);
    const { SparkdownPreviewGamePanelSerializer } =
      await import("../src/managers/SparkdownPreviewGamePanelSerializer");
    await new SparkdownPreviewGamePanelSerializer({
      extensionUri: "ext",
    } as any).deserializeWebviewPanel(second.panel as any, undefined);
    await first.start();

    expect(second.panel.disposed).toBe(true);
    expect(second.posted).toEqual([]);
    expect(first.panel.disposed).toBe(false);
    expect(manager.panel).toBe(first.panel);
    expect(first.initializations()).toHaveLength(1);
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
