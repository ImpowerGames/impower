import { afterEach, expect, it, vi } from "vitest";
import {
  makeMemoryDirectory,
  memoryLocks,
  memoryRoot,
  writeMemoryFile,
} from "../../../packages/opfs-workspace/test/memoryOpfs";

const services = vi.hoisted(() => ({
  fs: null as any,
  window: {
    recordScriptChange: async () => undefined,
    recordAssetChange: async () => undefined,
    openFileEditor: () => undefined,
    getActiveEditorForFile: () => undefined,
  },
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: services }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { storage?: unknown }).storage;
  delete (navigator as { locks?: unknown }).locks;
});

async function harness() {
  vi.resetModules();
  const root = memoryRoot();
  const bytes = (text: string) => new TextEncoder().encode(text);
  for (const [path, text] of Object.entries({ "main.sd": "Hello", ".layout": "1", ".folders": "1" })) {
    writeMemoryFile(root, `local/${path}`, bytes(text));
  }
  Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory: async () => root } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: memoryLocks() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("URL", Object.assign(class extends URL {}, {
    createObjectURL: () => "blob:scripts-trash",
    revokeObjectURL: () => undefined,
  }));
  const workers: { deliver(message: unknown): void }[] = [];
  class LoopbackWorker {
    listeners: ((event: { data: unknown }) => void)[] = [];
    constructor() { workers.push(this); }
    addEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listeners.push(listener); }
    postMessage(message: unknown) {
      const data = structuredClone(message);
      setTimeout(() => void (globalThis as any).onmessage({ data }), 0);
    }
    deliver(message: unknown) {
      const data = structuredClone(message);
      setTimeout(() => this.listeners.forEach((listener) => listener({ data })), 0);
    }
  }
  vi.stubGlobal("Worker", LoopbackWorker);
  vi.stubGlobal("BroadcastChannel", class { postMessage() {} close() {} });
  vi.stubGlobal("postMessage", (message: unknown) => workers.forEach((worker) => worker.deliver(message)));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../../../packages/opfs-workspace/src/opfs-workspace");
  const settings = { scriptFiles: "*.{sd,luau}", imageFiles: "*.png", audioFiles: "*.mp3", videoFiles: "*.mp4", fontFiles: "*.ttf" };
  await (globalThis as any).onmessage({ data: {
    jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings },
  } });
  const { default: WorkspaceFileSystem } = await import("../../src/modules/spark-editor/workspace/WorkspaceFileSystem");
  const { default: WorkspaceScripts } = await import("../../src/modules/spark-editor/workspace/WorkspaceScripts");
  const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  const history = await import("../../src/modules/spark-editor/utils/undoManager");
  history.clearUndoHistory();
  const ls = { connection: { onRequest() {}, sendNotification() {} }, start: async () => {}, getScriptReferences: async () => [] };
  const fs = new WorkspaceFileSystem(ls as never, { settings, onDidChange: () => () => {} } as never);
  services.fs = fs;
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "local" } };
  const scripts = new WorkspaceScripts({ fs, ls, window: services.window } as never);
  const uri = (path: string) => fs.getFileUri("local", path);
  const write = (path: string, text: string) => fs.createFiles({ files: [{ uri: uri(path), data: bytes(text).buffer }] });
  const read = async (path: string) => new TextDecoder().decode(await fs.readFile({ file: { uri: uri(path) } }));
  return { root, fs, scripts, history, uri, write, read, bytes };
}

it("keeps a deleted empty folder in the bin after its Undo has gone, and Restore brings it back", async () => {
  const h = await harness();
  makeMemoryDirectory(h.root, "local/Scripts/Empty");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Empty"]);
  expect(await h.fs.getFolders("local")).not.toContain("Scripts/Empty");
  h.history.clearUndoHistory();
  const batches = await h.fs.listTrash("local");
  expect(batches).toHaveLength(1);
  expect(batches[0]!.folders).toEqual(["Scripts/Empty"]);
  await h.fs.restoreTrash("local", batches[0]!.batchId);
  await vi.waitFor(async () => expect(await h.fs.getFolders("local")).toContain("Scripts/Empty"));
  expect(await h.fs.listTrash("local")).toEqual([]);
});

it("restores a deleted folder beside a live script now holding its name, with what it held", async () => {
  const h = await harness();
  makeMemoryDirectory(h.root, "local/Scripts/Drafts.sd/Empty");
  await h.write("Scripts/Drafts.sd/old.sd", "deleted version");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Drafts.sd"]);
  const [batch] = await h.fs.listTrash("local");
  await h.write("Scripts/Drafts.sd", "unrelated live script");
  const restored = await h.fs.restoreTrash("local", batch!.batchId);
  expect(restored.folders).toEqual(["Scripts/Drafts.sd (restored)", "Scripts/Drafts.sd (restored)/Empty"]);
  expect(await h.read("Scripts/Drafts.sd")).toBe("unrelated live script");
  expect(await h.read("Scripts/Drafts.sd (restored)/old.sd")).toBe("deleted version");
  await vi.waitFor(async () =>
    expect(await h.fs.getFolders("local")).toContain("Scripts/Drafts.sd (restored)/Empty"),
  );
  expect(await h.fs.listTrash("local")).toEqual([]);
});

it("redo removes the version Undo restored and preserves the live conflicting script", async () => {
  const h = await harness();
  await h.write("Scripts/Drafts/old.sd", "deleted version");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Drafts"]);
  await h.write("Scripts/Drafts/old.sd", "other tab's live version");
  expect(await h.history.undo()).toBe(true);
  expect(await h.read("Scripts/Drafts/old (restored).sd")).toBe("deleted version");
  expect(await h.read("Scripts/Drafts/old.sd")).toBe("other tab's live version");
  expect(await h.history.redo()).toBe(true);
  const files = await h.fs.getFiles("local");
  expect(Object.keys(files)).toContain(h.uri("Scripts/Drafts/old.sd"));
  expect(Object.keys(files)).not.toContain(h.uri("Scripts/Drafts/old (restored).sd"));
});

it("round trips folder-only Undo and redo, then Empty removes its batch", async () => {
  const h = await harness();
  makeMemoryDirectory(h.root, "local/Scripts/Empty/Inner");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Empty"]);
  expect(await h.history.undo()).toBe(true);
  expect(await h.fs.getFolders("local")).toContain("Scripts/Empty/Inner");
  expect(await h.history.redo()).toBe(true);
  expect(await h.fs.getFolders("local")).not.toContain("Scripts/Empty");
  expect((await h.fs.listTrash("local"))[0]!.folders).toContain("Scripts/Empty/Inner");
  await h.fs.emptyTrash("local");
  expect(await h.fs.listTrash("local")).toEqual([]);
});

it("restores a manifest without folders and purges a folder-only expired batch", async () => {
  const h = await harness();
  const batchId = "1__old";
  writeMemoryFile(h.root, `local/.trash/${batchId}/Scripts/old.sd`, h.bytes("old bytes"));
  writeMemoryFile(h.root, `local/.trash/${batchId}/__manifest.json`, h.bytes(JSON.stringify({
    deletedAt: 1,
    entries: [{ relPath: "Scripts/old.sd", originalUri: h.uri("Scripts/old.sd"), type: "script" }],
  })));
  expect((await h.fs.listTrash("local"))[0]!.folders).toBeUndefined();
  await h.fs.restoreTrash("local", batchId);
  expect(await h.read("Scripts/old.sd")).toBe("old bytes");
  makeMemoryDirectory(h.root, "local/Scripts/Empty");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Empty"]);
  await h.fs.purgeExpiredTrash("local", -1);
  expect(await h.fs.listTrash("local")).toEqual([]);
});

it("undoes a creation again from where its redo restored it, never the script that took its name", async () => {
  const h = await harness();
  const { recordCreate } = await import("../../src/modules/spark-editor/utils/fileUndo");
  await h.write("Scripts/new.sd", "created");
  recordCreate("local", [h.uri("Scripts/new.sd")], "new.sd");
  expect(await h.history.undo()).toBe(true);
  await h.write("Scripts/new.sd", "other script");
  expect(await h.history.redo()).toBe(true);
  expect(await h.read("Scripts/new (restored).sd")).toBe("created");
  expect(await h.history.undo()).toBe(true);
  const files = Object.keys(await h.fs.getFiles("local"));
  expect(files).toContain(h.uri("Scripts/new.sd"));
  expect(files).not.toContain(h.uri("Scripts/new (restored).sd"));
  expect(await h.read("Scripts/new.sd")).toBe("other script");
});
