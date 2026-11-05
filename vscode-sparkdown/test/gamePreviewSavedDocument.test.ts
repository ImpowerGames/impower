// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  saved: [] as any[],
  restored: undefined as unknown,
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
  whenControllerListening: () => Promise.resolve(),
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

const resized = (height: number, fit: "auto" | "ratio" | "height" = "height") => {
  document.body.dispatchEvent(
    new CustomEvent("jsonrpc", {
      bubbles: true,
      detail: {
        jsonrpc: "2.0",
        method: "game/resized",
        params: { width: 400, height, aspectRatio: null, fit },
      },
    }),
  );
};

const lastSaved = () => state.saved.at(-1);

const load = async () => {
  vi.resetModules();
  const saves: unknown[] = [];
  state.saved = saves;
  (globalThis as any).acquireVsCodeApi = () => ({
    postMessage: () => {},
    getState: () => state.restored,
    setState: (saved: unknown) => saves.push(JSON.parse(JSON.stringify(saved))),
  });
  await import("../webviews/game-webview/game-webview");
};

beforeEach(() => {
  state.saved = [];
  state.restored = undefined;
});

describe("saving the Game Preview's script", () => {
  it("saves the script the player is initialized with", async () => {
    await load();
    state.receive(initialize("file:///project/main.sd"));

    expect(lastSaved()?.textDocument.uri).toBe("file:///project/main.sd");
  });

  it("saves the script the author then selects a line in", async () => {
    await load();
    state.receive(initialize("file:///project/main.sd"));
    state.receive(select("file:///project/other.sd", true));

    expect(lastSaved()?.textDocument.uri).toBe("file:///project/other.sd");
  });

  it("keeps the script when a selection was not the author's", async () => {
    await load();
    state.receive(initialize("file:///project/main.sd"));
    state.receive(select("file:///project/other.sd", false));

    expect(lastSaved()?.textDocument.uri).toBe("file:///project/main.sd");
  });

  it("saves nothing for an initialization without a script", async () => {
    await load();
    state.receive(initialize());

    expect(state.saved).toEqual([]);
  });

  it("keeps the script and the canvas height together", async () => {
    await load();
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

  it("forgets the canvas height once the game fills the pane again, and saves nothing for an unchanged one", async () => {
    await load();
    state.receive(initialize("file:///project/main.sd"));
    resized(240);
    const saves = state.saved.length;
    resized(700, "auto");

    expect(state.saved).toHaveLength(saves + 1);
    expect(lastSaved()).toEqual({
      textDocument: { uri: "file:///project/main.sd" },
    });

    resized(650, "auto");
    resized(400, "ratio");

    expect(state.saved).toHaveLength(saves + 1);
  });
});

describe("restoring the Game Preview's saved state", () => {
  const restored = {
    textDocument: { uri: "file:///project/main.sd" },
    canvasHeight: 240,
  };

  it("keeps the restored canvas height when the player is initialized", async () => {
    state.restored = restored;
    await load();

    state.receive(initialize("file:///project/main.sd"));

    expect(lastSaved()).toEqual(restored);
  });

  it("keeps the restored script when the game reports its size first", async () => {
    state.restored = restored;
    await load();

    resized(300);

    expect(lastSaved()).toEqual({
      textDocument: { uri: "file:///project/main.sd" },
      canvasHeight: 300,
    });
  });
});
