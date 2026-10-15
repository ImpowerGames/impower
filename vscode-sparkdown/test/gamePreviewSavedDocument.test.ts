// @vitest-environment jsdom

// The game webview saves the script its preview shows, for VS Code to restore
// its panel with when the workspace reopens. It had stopped saving it, so a
// restored panel had no script to resume (#1886). These load the webview's
// own script, with the player and its workers stubbed out, and read what it
// hands VS Code's `setState`.

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  /** Every state the webview saved, in order. */
  saved: [] as any[],
  /** Delivers a message from the extension to the webview. */
  receive: (_message: unknown) => {},
}));

vi.mock("@impower/jsonrpc/src/browser/classes/WindowMessageConnection", () => ({
  WindowMessageConnection: class {
    listeners: ((e: { data: unknown }) => void)[] = [];
    constructor() {
      state.receive = (data) => {
        for (const listener of this.listeners) {
          listener({ data });
        }
      };
    }
    listen() {}
    postMessage() {}
    addEventListener(_type: string, listener: (e: { data: unknown }) => void) {
      this.listeners.push(listener);
    }
  },
}));
vi.mock("@impower/spark-web-player/src/index.js", () => ({
  SparkWebPlayerElement: { register: async () => {} },
  setWorkspace: () => {},
}));
vi.mock(
  "@impower/spark-web-player/src/main/workers/installWorkspaceWorker",
  () => ({ installWorkspaceWorker: () => ({ workspace: undefined }) }),
);

const initialize = (uri?: string) => ({
  jsonrpc: "2.0",
  method: "initialize",
  id: 1,
  params: {
    initializationOptions: { settings: {}, uri },
    capabilities: {},
    rootUri: null,
    processId: 0,
  },
});

const select = (uri: string, userEvent: boolean) => ({
  jsonrpc: "2.0",
  method: "textDocument/didSelect",
  params: {
    textDocument: { uri },
    selectedRange: {
      start: { line: 3, character: 0 },
      end: { line: 3, character: 0 },
    },
    docChanged: false,
    userEvent,
  },
});

/** The player reporting its canvas height, as it bubbles up to the window. */
const resized = (height: number) => {
  document.body.dispatchEvent(
    new CustomEvent("jsonrpc", {
      bubbles: true,
      detail: { jsonrpc: "2.0", method: "game/resized", params: { height } },
    }),
  );
};

const lastSaved = () => state.saved.at(-1);

beforeEach(async () => {
  vi.resetModules();
  state.saved = [];
  (globalThis as any).acquireVsCodeApi = () => ({
    postMessage: () => {},
    setState: (saved: unknown) =>
      state.saved.push(JSON.parse(JSON.stringify(saved))),
  });
  await import("../webviews/game-webview/game-webview");
});

describe("saving the Game Preview's script", () => {
  it("saves the script the player is initialized with", () => {
    state.receive(initialize("file:///project/main.sd"));

    expect(lastSaved()?.textDocument.uri).toBe("file:///project/main.sd");
  });

  it("saves the script the author then selects a line in", () => {
    state.receive(initialize("file:///project/main.sd"));
    state.receive(select("file:///project/other.sd", true));

    expect(lastSaved()?.textDocument.uri).toBe("file:///project/other.sd");
  });

  it("keeps the script when a selection was not the author's", () => {
    state.receive(initialize("file:///project/main.sd"));
    state.receive(select("file:///project/other.sd", false));

    expect(lastSaved()?.textDocument.uri).toBe("file:///project/main.sd");
  });

  it("saves nothing for an initialization without a script", () => {
    state.receive(initialize());

    expect(state.saved).toEqual([]);
  });

  it("keeps the script and the canvas height together", () => {
    resized(240);
    state.receive(initialize("file:///project/main.sd"));

    expect(lastSaved()).toEqual({
      textDocument: { uri: "file:///project/main.sd" },
      canvasHeight: 240,
    });

    resized(300);

    expect(lastSaved()).toEqual({
      textDocument: { uri: "file:///project/main.sd" },
      canvasHeight: 300,
    });
  });
});
