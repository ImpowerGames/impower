import { afterEach, expect, it, vi } from "vitest";
import { memoryLocks, memoryRoot, writeMemoryFile } from "../../../packages/opfs-workspace/test/memoryOpfs";

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

async function freshProject() {
  vi.resetModules();
  const root = memoryRoot();
  const bytes = (text: string) => new TextEncoder().encode(text);
  for (const [path, text] of Object.entries({ ".layout": "1", ".folders": "1" })) {
    writeMemoryFile(root, `local/${path}`, bytes(text));
  }
  Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory: async () => root } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: memoryLocks() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("URL", Object.assign(class extends URL {}, {
    createObjectURL: () => "blob:scripts-duplicate",
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
  const ls = { connection: { onRequest() {}, sendNotification() {} }, start: async () => {}, getScriptReferences: async () => [] };
  const fs = new WorkspaceFileSystem(ls as never, { settings, onDidChange: () => () => {} } as never);
  services.fs = fs;
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "local" } };
  const scripts = new WorkspaceScripts({ fs, ls, window: services.window } as never);
  const uri = (path: string) => fs.getFileUri("local", path);
  const read = async (path: string) => new TextDecoder().decode(await fs.readFile({ file: { uri: uri(path) } }));
  return { fs, scripts, uri, read };
}

it("duplicates the starter Main of a project that has never saved it", async () => {
  const h = await freshProject();
  const listing = await h.scripts.load();
  expect(Object.keys(listing!.files)).toEqual(["main.sd"]);
  const copy = await h.scripts.duplicate("main.sd");
  expect(await h.read(copy)).toBe("scene start\n  \nend\n");
  const after = await h.scripts.load();
  expect(Object.keys(after!.files).sort()).toEqual(["main.sd", copy].sort());
});

it("rejects a failed storage read with an Error that carries the storage worker's reason", async () => {
  const h = await freshProject();
  await h.scripts.load();
  const failure = await h.fs.readFile({ file: { uri: h.uri("Scripts/missing.sd") } }).catch((e: unknown) => e);
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe(`${h.uri("Scripts/missing.sd")} was not found`);
});
