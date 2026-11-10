// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
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

const controls = (skipButtons: boolean) => ({
  jsonrpc: "2.0",
  method: "preview/setControls",
  params: { skipButtons },
});

const load = async () => {
  vi.resetModules();
  document.body.innerHTML =
    '<spark-web-player toolbar play-button play-label="RUN"></spark-web-player>';
  (globalThis as any).acquireVsCodeApi = () => ({
    postMessage: () => {},
    getState: () => undefined,
    setState: () => {},
  });
  await import("../webviews/game-webview/game-webview");
  return document.querySelector("spark-web-player") as HTMLElement & {
    skipButtons?: boolean;
  };
};

describe("the Game Preview webview's skip controls", () => {
  it("turns the player's skip buttons on and off as the panel asks", async () => {
    const player = await load();
    expect(player.skipButtons).toBeUndefined();

    state.receive(controls(true));
    expect(player.skipButtons).toBe(true);

    state.receive(controls(false));
    expect(player.skipButtons).toBe(false);
  });
});
