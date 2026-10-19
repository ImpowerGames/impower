// How a Screenplay Preview that VS Code restores when a workspace reopens is
// given its content (#1888). VS Code hands the extension's serializer the
// panel and the state the webview last saved, which may be none at all. The
// serializer initialized the panel only when the saved script had an open
// editor and otherwise left it alone, so the restored tab stayed empty.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** The documents already open in the workspace. */
  textDocuments: [] as { uri: { toString(): string } }[],
  /** The documents `openTextDocument` can open, by uri. */
  openable: new Map<string, unknown>(),
  manager: {
    panel: undefined as unknown,
    initializePanel: undefined as unknown as ReturnType<typeof vi.fn>,
  },
}));

vi.mock("vscode", () => ({
  Uri: { parse: (uri: string) => ({ toString: () => uri }) },
  window: { activeTextEditor: undefined, visibleTextEditors: [] },
  workspace: {
    get textDocuments() {
      return state.textDocuments;
    },
    openTextDocument: async (uri: { toString(): string }) => {
      const document = state.openable.get(uri.toString());
      if (!document) {
        throw new Error(`cannot open ${uri.toString()}`);
      }
      return document;
    },
  },
}));
vi.mock("../src/managers/SparkdownPreviewScreenplayPanelManager", () => ({
  SparkdownPreviewScreenplayPanelManager: { instance: state.manager },
}));

const document = (uri: string) => ({ uri: { toString: () => uri } });

const restoredPanel = () => {
  const panel = {
    disposed: false,
    dispose() {
      panel.disposed = true;
    },
    webview: { html: "" },
  };
  return panel;
};

const restore = async (panel: unknown, saved: unknown) => {
  const { SparkdownPreviewScreenplayPanelSerializer } =
    await import("../src/managers/SparkdownPreviewScreenplayPanelSerializer");
  await new SparkdownPreviewScreenplayPanelSerializer({
    extensionUri: "ext",
  } as any).deserializeWebviewPanel(panel as any, saved as any);
};

beforeEach(() => {
  state.textDocuments = [];
  state.openable = new Map();
  state.manager.panel = undefined;
  state.manager.initializePanel = vi.fn(async (_c, _d, panel) => {
    state.manager.panel = panel;
  });
});

describe("restoring the Screenplay Preview when the workspace reopens", () => {
  it("opens the saved script when no editor shows it", async () => {
    const saved = document("file:///project/main.sd");
    state.openable.set("file:///project/main.sd", saved);
    const panel = restoredPanel();

    await restore(panel, { textDocument: { uri: "file:///project/main.sd" } });

    expect(state.manager.initializePanel).toHaveBeenCalledTimes(1);
    expect(state.manager.initializePanel.mock.calls[0]![1]).toBe(saved);
    expect(state.manager.initializePanel.mock.calls[0]![2]).toBe(panel);
    expect(panel.disposed).toBe(false);
  });

  it("uses the saved script already open in the workspace", async () => {
    const saved = document("file:///project/main.sd");
    state.textDocuments.push(saved);
    const panel = restoredPanel();

    await restore(panel, { textDocument: { uri: "file:///project/main.sd" } });

    expect(state.manager.initializePanel.mock.calls[0]![1]).toBe(saved);
    expect(panel.disposed).toBe(false);
  });

  it("closes a restored panel that saved no state", async () => {
    const panel = restoredPanel();

    await restore(panel, undefined);

    expect(state.manager.initializePanel).not.toHaveBeenCalled();
    expect(panel.disposed).toBe(true);
  });

  it("closes a restored panel that saved no script", async () => {
    const panel = restoredPanel();

    await restore(panel, { textDocument: { uri: "" } });

    expect(state.manager.initializePanel).not.toHaveBeenCalled();
    expect(panel.disposed).toBe(true);
  });

  it("closes a restored panel whose script cannot be opened", async () => {
    const panel = restoredPanel();

    await restore(panel, { textDocument: { uri: "file:///project/gone.sd" } });

    expect(state.manager.initializePanel).not.toHaveBeenCalled();
    expect(panel.disposed).toBe(true);
  });

  it("closes a second restored panel rather than take over the first", async () => {
    state.openable.set(
      "file:///project/main.sd",
      document("file:///project/main.sd"),
    );
    const first = restoredPanel();
    const second = restoredPanel();

    await restore(first, { textDocument: { uri: "file:///project/main.sd" } });
    await restore(second, { textDocument: { uri: "file:///project/main.sd" } });

    expect(state.manager.initializePanel).toHaveBeenCalledTimes(1);
    expect(state.manager.panel).toBe(first);
    expect(first.disposed).toBe(false);
    expect(second.disposed).toBe(true);
  });
});
