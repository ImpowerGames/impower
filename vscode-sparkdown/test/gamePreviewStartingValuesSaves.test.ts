import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({
  vscode: null as unknown as FakeVscode,
  files: new Map<string, Uint8Array>(),
}));

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  state.vscode = fakeVscode();
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
    window: {
      ...state.vscode.window,
      showErrorMessage: () => Promise.resolve(undefined),
    },
    workspace: {
      ...state.vscode.workspace,
      fs: {
        readFile: async (file: { path: string }) => {
          const bytes = state.files.get(file.path);
          if (!bytes) {
            throw Object.assign(new Error("not found"), {
              code: "FileNotFound",
            });
          }
          return bytes;
        },
        writeFile: async (file: { path: string }, bytes: Uint8Array) => {
          state.files.set(file.path, bytes);
        },
        createDirectory: async () => {},
      },
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

const SAVE: PreviewSave = {
  id: "saved-1",
  kind: "saved",
  name: "interrogation, line 11",
  scene: "interrogation",
  uri: "file:///project/main.sd",
  line: 11,
  time: 1700000000500,
  data: '{"story":{}}',
  edits: [["form:interrogation.0.c-0", "1"]],
};

const open = async () => {
  const { SparkdownPreviewGamePanelManager } =
    await import("../src/managers/SparkdownPreviewGamePanelManager");
  const { SparkdownStartingValuesManager } =
    await import("../src/managers/SparkdownStartingValuesManager");
  const { SparkdownPreviewSavesManager } =
    await import("../src/managers/SparkdownPreviewSavesManager");
  const context = {
    extensionUri: "ext",
    storageUri: { path: "/storage/workspace-1" },
    workspaceState: memento(),
    globalState: memento(),
    subscriptions: [],
  } as any;
  SparkdownStartingValuesManager.instance.activate(context);
  SparkdownPreviewSavesManager.instance.activate(context);
  const manager = new SparkdownPreviewGamePanelManager() as any;
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
          if (!("error" in message)) {
            queueMicrotask(() =>
              receive({
                jsonrpc: "2.0",
                method: message.method,
                id: message.id,
                result: {},
              }),
            );
          }
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
  await manager.initializePanel(panel, context, undefined);
  let nextId = 0;
  const request = async (method: string, params: unknown) => {
    const id = `player-${nextId++}`;
    await receive({ jsonrpc: "2.0", method, id, params });
    return posted.find((m) => m.id === id && ("result" in m || "error" in m));
  };
  return { posted, receive: (m: unknown) => receive(m), request };
};

beforeAll(async () => {
  await import("../src/managers/SparkdownPreviewGamePanelManager");
}, 60000);

beforeEach(() => {
  state.files.clear();
});

describe("the Game Preview's starting values in the extension", () => {
  it("answers the player's change and sends the kept values back", async () => {
    const { posted, request } = await open();

    const answer = await request("preview/changeStartingValues", {
      start: "interrogation",
      changes: { "store:trust": "2" },
    });

    expect(answer).toMatchObject({ result: {} });
    expect(
      posted.filter((m) => m.method === "preview/setStartingValues").at(-1)
        ?.params,
    ).toEqual({ values: { interrogation: { "store:trust": "2" } } });
  });

  it("sends the kept values to a player that has just mounted", async () => {
    const { posted, request, receive } = await open();
    await request("preview/changeStartingValues", {
      start: "interrogation",
      changes: { "store:trust": "2" },
    });
    posted.length = 0;

    await receive(CONNECTED);

    expect(
      posted.find((m) => m.method === "preview/setStartingValues")?.params,
    ).toEqual({ values: { interrogation: { "store:trust": "2" } } });
  });
});

describe("the Game Preview's saves in the extension", () => {
  it("answers the player's write, list, rename and delete", async () => {
    const { request } = await open();

    expect(await request("preview/listSaves", {})).toMatchObject({
      result: { saves: [] },
    });
    expect(
      await request("preview/writeSave", { save: SAVE }),
    ).toMatchObject({ result: {} });
    expect(await request("preview/listSaves", {})).toMatchObject({
      result: { saves: [SAVE] },
    });
    expect(
      await request("preview/renameSave", { id: SAVE.id, name: "Before" }),
    ).toMatchObject({ result: {} });
    expect(
      (await request("preview/listSaves", {})).result.saves[0].name,
    ).toBe("Before");
    expect(
      await request("preview/deleteSaves", { ids: [SAVE.id] }),
    ).toMatchObject({ result: {} });
    expect(await request("preview/listSaves", {})).toMatchObject({
      result: { saves: [] },
    });
  });

  it("answers a request the host cannot keep with an error the player shows", async () => {
    const { request } = await open();

    const answer = await request("preview/renameSave", {
      id: "missing",
      name: "x",
    });

    expect(answer?.error?.message).toBe("No save has that id.");
  });
});
