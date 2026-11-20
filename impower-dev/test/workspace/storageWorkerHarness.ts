import { vi } from "vitest";
import { memoryLocks, memoryRoot, writeMemoryFile } from "../../../packages/opfs-workspace/test/memoryOpfs";

export function releaseStorageWorker() {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { storage?: unknown }).storage;
  delete (navigator as { locks?: unknown }).locks;
}

export async function storageWorkerHarness(
  services: { fs: unknown; window: unknown },
  seed: Record<string, string>,
) {
  vi.resetModules();
  const root = memoryRoot();
  const bytes = (text: string) => new TextEncoder().encode(text);
  for (const [path, text] of Object.entries(seed)) {
    writeMemoryFile(root, `local/${path}`, bytes(text));
  }
  Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory: async () => root } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: memoryLocks() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("URL", Object.assign(class extends URL {}, {
    createObjectURL: () => "blob:storage-worker-harness",
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
  const ls = {
    connection: { onRequest() {}, sendNotification() {} },
    start: async () => {},
    getScriptReferences: async () => [],
    getCopiedScriptTexts: vi.fn(async (copied: { uri: string; text: string }[], suffix: string) =>
      copied.map(({ text }) => `${text}<renamed ${suffix}>`),
    ),
  };
  const fs = new WorkspaceFileSystem(ls as never, { settings, onDidChange: () => () => {} } as never);
  services.fs = fs;
  workspace.current = { ...workspace.current, project: { ...workspace.current.project, id: "local" } };
  const scripts = new WorkspaceScripts({ fs, ls, window: services.window } as never);
  const uri = (path: string) => fs.getFileUri("local", path);
  const write = (path: string, text: string) => fs.createFiles({ files: [{ uri: uri(path), data: bytes(text).buffer }] });
  const read = async (path: string) => new TextDecoder().decode(await fs.readFile({ file: { uri: uri(path) } }));
  return { root, fs, ls, scripts, uri, write, read, bytes };
}
