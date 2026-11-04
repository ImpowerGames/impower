import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeVscode } from "./fakeVscode";

const state = vi.hoisted(() => ({
  vscode: null as unknown as FakeVscode,
  files: new Map<string, Uint8Array>(),
  directories: new Set<string>(),
}));

interface FakeUri {
  path: string;
  toString(): string;
}

const uri = (path: string): FakeUri => ({
  path,
  toString: () => `file://${path}`,
});

vi.mock("vscode", async () => {
  const { fakeVscode } = await import("./fakeVscode");
  state.vscode = fakeVscode();
  return {
    ...state.vscode,
    Uri: {
      joinPath: (base: FakeUri, ...parts: string[]) =>
        uri([base.path, ...parts].join("/")),
    },
    workspace: {
      ...state.vscode.workspace,
      fs: {
        readFile: async (file: FakeUri) => {
          const bytes = state.files.get(file.path);
          if (!bytes) {
            throw Object.assign(new Error(`${file.path} not found`), {
              code: "FileNotFound",
            });
          }
          return bytes;
        },
        writeFile: async (file: FakeUri, bytes: Uint8Array) => {
          const directory = file.path.slice(0, file.path.lastIndexOf("/"));
          if (!state.directories.has(directory)) {
            throw Object.assign(new Error(`${directory} not found`), {
              code: "FileNotFound",
            });
          }
          state.files.set(file.path, bytes);
        },
        createDirectory: async (directory: FakeUri) => {
          state.directories.add(directory.path);
        },
      },
    },
  };
});

const STORAGE = "/storage/workspace-1/impower.sparkdown";

const lastRun: PreviewSave = {
  id: "last-run-interrogation",
  kind: "lastRun",
  name: "Entering interrogation",
  scene: "interrogation",
  uri: "file:///project/main.sd",
  line: 5,
  time: 1700000000000,
  data: '{"story":{"form:interrogation":1}}',
  entry: {
    values: { "param:hour": '"nine"', "store:trust": "0" },
    frames: [
      {
        flow: "interrogation",
        scene: "interrogation",
        uri: "file:///project/main.sd",
        line: 5,
        scopes: [{ hour: '"nine"' }],
        scopeFlows: ["interrogation"],
      },
    ],
  },
  run: "run-1",
};

const saved: PreviewSave = {
  id: "saved-1",
  kind: "saved",
  name: "interrogation, line 11",
  scene: "interrogation",
  uri: "file:///project/main.sd",
  line: 11,
  time: 1700000000500,
  data: '{"story":{"form:interrogation.0.c-0":2}}',
  edits: [["form:interrogation.0.c-0", "1"]],
};

const activate = async (storageUri: FakeUri | undefined) => {
  const { SparkdownPreviewSavesManager } =
    await import("../src/managers/SparkdownPreviewSavesManager");
  const manager = new SparkdownPreviewSavesManager();
  manager.activate({ storageUri, subscriptions: [] } as any);
  return manager;
};

beforeEach(() => {
  state.files.clear();
  state.directories.clear();
});

describe("the extension's preview saves", () => {
  it("are kept as a file in the workspace storage folder and returned exactly as written after a window reload", async () => {
    const manager = await activate(uri(STORAGE));

    await manager.write(lastRun);
    await manager.write(saved);
    const reloaded = await activate(uri(STORAGE));

    expect([...state.files.keys()]).toEqual([
      `${STORAGE}/preview-saves/workspace.json`,
    ]);
    expect(await reloaded.list()).toEqual([lastRun, saved]);
  });

  it("are none before the first save", async () => {
    const manager = await activate(uri(STORAGE));

    expect(await manager.list()).toEqual([]);
  });

  it("replace a save written again under its id, rename it and delete it", async () => {
    const manager = await activate(uri(STORAGE));
    await manager.write(lastRun);
    await manager.write(saved);

    await manager.write({ ...lastRun, time: lastRun.time + 1 });
    await manager.rename(saved.id, "Before the lie");
    expect(await manager.list()).toEqual([
      { ...lastRun, time: lastRun.time + 1 },
      { ...saved, name: "Before the lie" },
    ]);
    await manager.delete([lastRun.id]);
    expect(await manager.list()).toEqual([
      { ...saved, name: "Before the lie" },
    ]);
  });

  it("refuse a rename of a save they do not keep", async () => {
    const manager = await activate(uri(STORAGE));

    await expect(manager.rename("missing", "x")).rejects.toThrow();
  });

  it("refuse a write with no workspace folder open, and list none", async () => {
    const manager = await activate(undefined);

    await expect(manager.write(saved)).rejects.toThrow(
      "Saves are kept only while a folder is open.",
    );
    expect(await manager.list()).toEqual([]);
  });
});
