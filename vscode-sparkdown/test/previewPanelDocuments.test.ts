import { describe, expect, it, vi } from "vitest";
import type { FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({ vscode: null as unknown as FakeVscode }));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  state.vscode = fakeVscode();
  return { ...state.vscode, ViewColumn: { Two: 2 } };
});
vi.mock("../src/utils/getWorkspaceFiles", () => ({
  getWorkspaceFiles: async () => [],
}));
vi.mock("../src/utils/getWorkspaceFileWatchers", () => ({
  getWorkspaceFileWatchers: () => [],
}));

/** The manager with a stand-in panel that records what it is sent. */
const load = async () => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  const { document } = await import("./fakeVscode");
  const manager = new SparkdownPreviewGamePanelManager() as any;
  const posted: any[] = [];
  manager._panel = { webview: { postMessage: (m: unknown) => posted.push(m) } };
  return { manager, posted, document };
};

describe("the Game Preview panel", () => {
  it("announces the project's open scripts with the editor's text and version", async () => {
    const { manager, posted, document } = await load();
    manager.notifyOpenedTextDocument(
      document("file:///project/main.sd", "scene START\nend", 7),
    );
    manager.notifyClosedTextDocument(document("file:///project/main.sd", ""));
    expect(posted).toEqual([
      expect.objectContaining({
        method: "textDocument/didOpen",
        params: {
          textDocument: {
            uri: "file:///project/main.sd",
            languageId: "sparkdown",
            version: 7,
            text: "scene START\nend",
          },
        },
      }),
      expect.objectContaining({
        method: "textDocument/didClose",
        params: { textDocument: { uri: "file:///project/main.sd" } },
      }),
    ]);
  });

  it("does not announce a view of a script outside the project, or another language", async () => {
    const { manager, posted, document } = await load();
    manager.notifyOpenedTextDocument(
      document("git:/project/main.sd?ref=HEAD", "old", 1, true),
    );
    manager.notifyOpenedTextDocument({
      ...document("file:///project/notes.md", "# notes"),
      languageId: "markdown",
    });
    expect(posted).toEqual([]);
  });

  it("announces open scripts and tells listeners each time its player is initialized", async () => {
    const { manager, posted, document } = await load();
    state.vscode.workspace.textDocuments = [
      document("file:///project/main.sd", "scene START\nend", 4),
    ];
    manager.sendRequest = async () => ({});
    let connected = 0;
    manager.onDidConnectPanel(() => connected++);
    await manager.connectAndInitializeWebview(undefined);
    await manager.connectAndInitializeWebview(undefined);
    expect(connected).toBe(2);
    expect(
      posted.filter((m) => m.method === "textDocument/didOpen"),
    ).toHaveLength(2);
    expect(manager.connected).toBe(true);
  });

  it("sends a completion preview notification to the player", async () => {
    const { manager, posted } = await load();
    const params = {
      textDocument: { uri: "file:///project/main.sd", version: 3 },
      session: 1,
      request: 1,
      state: "close" as const,
    };
    manager.notifyPreviewCompletion(params);
    expect(posted).toEqual([
      expect.objectContaining({
        method: "textDocument/previewCompletion",
        params,
      }),
    ]);
  });

  it("takes previews only while open, connected and not playing", async () => {
    const { manager } = await load();
    manager._connected = true;
    expect(manager.canPreviewCompletions).toBe(true);
    manager._gameRunning = true;
    expect(manager.canPreviewCompletions).toBe(false);
    manager._gameRunning = false;
    manager._panel = undefined;
    expect(manager.canPreviewCompletions).toBe(false);
  });
});
