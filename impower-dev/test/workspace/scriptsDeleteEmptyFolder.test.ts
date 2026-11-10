import { afterEach, expect, it, vi } from "vitest";
import { memoryRoot, makeMemoryDirectory, writeMemoryFile, memoryLocks } from "../../../packages/opfs-workspace/test/memoryOpfs";

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

it("keeps a deleted empty folder in the bin after its Undo has gone, and Restore brings it back", async () => {
  const root = memoryRoot();
  const encoder = new TextEncoder();
  for (const [path, text] of Object.entries({ "main.sd": "Hello", ".layout": "1", ".folders": "1" })) {
    writeMemoryFile(root, `local/${path}`, encoder.encode(text));
  }
  makeMemoryDirectory(root, "local/Scripts/Empty");
  Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory: async () => root } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: memoryLocks() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
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
  await import("../../../packages/opfs-workspace/src/opfs-workspace");
  const settings = {
    scriptFiles: "*.{sd,luau}", imageFiles: "*.png", audioFiles: "*.mp3", videoFiles: "*.mp4", fontFiles: "*.ttf",
  };
  await (globalThis as any).onmessage({ data: {
    jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings },
  } });
  const { default: WorkspaceFileSystem } = await import("../../src/modules/spark-editor/workspace/WorkspaceFileSystem");
  const { default: WorkspaceScripts } = await import("../../src/modules/spark-editor/workspace/WorkspaceScripts");
  const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
  const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");
  const { clearUndoHistory } = await import("../../src/modules/spark-editor/utils/undoManager");
  const ls = { connection: { onRequest() {}, sendNotification() {} }, start: async () => {}, getScriptReferences: async () => [] };
  const fs = new WorkspaceFileSystem(ls as never, { settings, onDidChange: () => () => {} } as never);
  services.fs = fs;
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "local" } };
  const scripts = new WorkspaceScripts({ fs, ls, window: services.window } as never);
  await scripts.load();
  expect(await fs.getFolders("local")).toContain("Scripts/Empty");
  await scripts.remove(["Scripts/Empty"]);
  expect(snackbar.value?.message).toBe("Deleted Empty");
  expect(await fs.getFolders("local")).not.toContain("Scripts/Empty");
  snackbar.value = null;
  clearUndoHistory();
  const batches = await fs.listTrash("local");
  expect(batches).toHaveLength(1);
  expect(batches[0]!.folders).toEqual(["Scripts/Empty"]);
  await fs.restoreTrash("local", batches[0]!.batchId);
  await vi.waitFor(async () => expect(await fs.getFolders("local")).toContain("Scripts/Empty"));
  expect(await fs.listTrash("local")).toEqual([]);
});
