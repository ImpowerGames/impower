import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({
  vscode: null as unknown as FakeVscode,
  errors: [] as string[],
  reads: 0,
  holding: false,
  releases: [] as (() => void)[],
  extraFiles: [] as { type: string; uri: string; name: string; ext: string; version: null; languageId: null }[],
  onCreate: [] as ((uri: { toString(): string }) => void)[],
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
    window: {
      ...state.vscode.window,
      showErrorMessage: (message: string) => {
        state.errors.push(message);
        return Promise.resolve(undefined);
      },
    },
  };
});
vi.mock("../src/utils/getWorkspaceFiles", () => ({
  getWorkspaceFiles: async () => {
    state.reads++;
    if (state.holding) {
      await new Promise<void>((resolve) => state.releases.push(resolve));
    }
    return [
      { type: "script", uri: "file:///project/main.sd", name: "main", ext: "sd", text: "", version: null, languageId: null },
      { type: "image", uri: "file:///project/bg.png", name: "bg", ext: "png", version: null, languageId: null },
      ...state.extraFiles,
    ];
  },
}));
vi.mock("../src/utils/getWorkspaceFileWatchers", () => ({
  getWorkspaceFileWatchers: () => [
    {
      onDidCreate: (listener: (uri: { toString(): string }) => void) => {
        state.onCreate.push(listener);
        return { dispose: () => {} };
      },
      onDidChange: () => ({ dispose: () => {} }),
      onDidDelete: () => ({ dispose: () => {} }),
    },
  ],
}));

const CONNECTED = {
  jsonrpc: "2.0",
  method: "preview/connected",
  params: { type: "game" },
};

const extensionContext = {
  extensionUri: "ext",
  globalState: {
    get: (_key: string, fallback?: unknown) => fallback,
    update: () => Promise.resolve(),
  },
} as any;

const open = async (
  answer: (request: any) => object = () => ({ result: {} }),
) => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  const manager = new SparkdownPreviewGamePanelManager() as any;
  const posted: any[] = [];
  let receive!: (message: unknown) => Promise<void>;
  const panel = {
    webview: {
      cspSource: "csp",
      html: "",
      asWebviewUri: (uri: { toString(): string }) => ({
        toString: () => `https://webview/${uri.toString().slice("file:///".length)}`,
      }),
      postMessage: (message: any) => {
        posted.push(message);
        if (message?.id != null && message.method) {
          queueMicrotask(() =>
            receive({
              jsonrpc: "2.0",
              method: message.method,
              id: message.id,
              ...answer(message),
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
  await manager.initializePanel(panel, extensionContext, undefined);
  const initializations = () =>
    posted.filter((m) => m.method === "initialize" && m.id != null);
  return { manager, posted, receive: (m: unknown) => receive(m), initializations };
};

beforeEach(() => {
  state.errors = [];
  state.reads = 0;
  state.holding = false;
  state.releases = [];
  state.extraFiles = [];
  state.onCreate = [];
});

describe("starting the Game Preview's player", () => {
  it("initializes the player once, when it has mounted, not also when the script loads", async () => {
    const { receive, initializations } = await open();

    await Promise.all([receive({}), receive(CONNECTED)]);

    expect(initializations()).toHaveLength(1);
  });

  it("initializes a reloaded webview's player again", async () => {
    const { receive, initializations } = await open();

    await receive(CONNECTED);
    await receive(CONNECTED);

    expect(initializations()).toHaveLength(2);
  });

  it("initializes a webview reloaded while the first read is under way once", async () => {
    state.holding = true;
    const { receive, initializations } = await open();

    const first = receive(CONNECTED);
    await Promise.resolve();
    const second = receive(CONNECTED);
    await Promise.resolve();
    for (const release of state.releases) release();
    await Promise.all([first, second]);

    expect(initializations()).toHaveLength(1);
  });

  it("initializes a webview reloaded while the first read is under way once, when the old read ends first", async () => {
    state.holding = true;
    const { receive, initializations } = await open();

    const first = receive(CONNECTED);
    await Promise.resolve();
    await receive({});
    for (const release of state.releases.splice(0)) release();
    await first;
    expect(initializations()).toHaveLength(0);

    const second = receive(CONNECTED);
    await Promise.resolve();
    for (const release of state.releases.splice(0)) release();
    await second;

    expect(initializations()).toHaveLength(1);
  });

  it("answers the webview's empty message once, not every message", async () => {
    const { receive, posted } = await open();

    await receive({});
    await receive(CONNECTED);
    await receive({ jsonrpc: "2.0", method: "preview/hoveredOn", params: { type: "game" } });

    expect(posted.filter((m) => Object.keys(m).length === 0)).toHaveLength(1);
  });

  it("gives the player every file's webview address with the project", async () => {
    const { receive, initializations } = await open();

    await receive(CONNECTED);

    expect(
      initializations()[0].params.initializationOptions.files.map(
        (file: any) => [file.uri, file.src],
      ),
    ).toEqual([
      ["file:///project/main.sd", "https://webview/project/main.sd"],
      ["file:///project/bg.png", "https://webview/project/bg.png"],
    ]);
  });

  it("reads the project's files while the webview loads", async () => {
    await open();

    expect(state.reads).toBe(1);
  });

  it("gives the player a file created after the early read, before it mounted", async () => {
    const { receive, initializations } = await open();
    await Promise.resolve();
    const room = {
      type: "image",
      uri: "file:///project/room.png",
      name: "room",
      ext: "png",
      version: null,
      languageId: null,
    } as const;
    state.extraFiles = [room];
    for (const created of state.onCreate) created({ toString: () => room.uri });

    await receive(CONNECTED);

    expect(
      initializations()[0].params.initializationOptions.files.map(
        (file: any) => file.uri,
      ),
    ).toContain(room.uri);
  });

  it("tells the author when the player cannot be initialized", async () => {
    const { receive } = await open((request) =>
      request.method === "initialize"
        ? { error: { code: -32603, message: "compiler worker failed to start" } }
        : { result: {} },
    );

    await receive(CONNECTED);

    expect(state.errors).toEqual([
      "Game Preview could not start: compiler worker failed to start",
    ]);
  });
});
