import { afterEach, expect, it, vi } from "vitest";
import {
  MemoryDirectory,
  MemoryFile,
  memoryLocks,
  memoryRoot,
  writeMemoryFile,
} from "../../../packages/opfs-workspace/test/memoryOpfs";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: {} }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { storage?: unknown }).storage;
  delete (navigator as { locks?: unknown }).locks;
});

const bytes = (text: string) => new TextEncoder().encode(text);

async function harness() {
  vi.resetModules();
  const root = memoryRoot();
  for (const [path, text] of Object.entries({ "main.sd": "see a", "scripts/zz.sd": "see a", "assets/a.png": "PNG" })) {
    writeMemoryFile(root, `local/${path}`, bytes(text));
  }
  Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory: async () => root } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: memoryLocks() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("URL", Object.assign(class extends URL {}, {
    createObjectURL: () => "blob:rename-rollback",
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
  const settings = { scriptFiles: "*.sd", imageFiles: "*.png" };
  await (globalThis as any).onmessage({ data: {
    jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings },
  } });
  const { default: WorkspaceFileSystem } = await import("../../src/modules/spark-editor/workspace/WorkspaceFileSystem");
  const { renameOrReport } = await import("../../src/modules/spark-editor/utils/renameOrReport");
  const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");
  let fs: any;
  const ls = {
    connection: { onRequest() {}, sendNotification() {} },
    start: async () => {},
    getFileRenameEdits: async (oldUri: string, newName: string) => ({
      documentChanges: [
        ...["main.sd", "scripts/zz.sd"].map((script) => ({
          textDocument: { uri: fs.getFileUri("local", script), version: null },
          edits: [{ range: { start: { line: 0, character: 4 }, end: { line: 0, character: 5 } }, newText: newName }],
        })),
        { kind: "rename", oldUri, newUri: fs.getFileUri("local", `assets/${newName}.png`) },
      ],
    }),
  };
  fs = new WorkspaceFileSystem(ls as never, { settings, onDidChange: () => () => {} } as never);
  await fs.getFiles("local");
  const project = root.entries.get("local") as MemoryDirectory;
  const assets = project.entries.get("assets") as MemoryDirectory;
  const fileAt = (name: string) => project.entries.get(name) as MemoryFile;
  const rename = () =>
    renameOrReport("assets/a.png", "assets/b.png", () =>
      fs.renameFileWithReferences("local", "assets/a.png", "assets/b.png"),
    );
  const read = async (path: string) =>
    new TextDecoder().decode(await fs.readFile({ file: { uri: fs.getFileUri("local", path) } }));
  const write = (path: string, text: string) =>
    fs.createFiles({ files: [{ uri: fs.getFileUri("local", path), data: new TextEncoder().encode(text).buffer }] });
  return { assets, fileAt, rename, read, write, snackbar };
}

const failCreating = (directory: MemoryDirectory, name: string) => {
  const get = directory.getFileHandle.bind(directory);
  directory.getFileHandle = async (entry, options = {}) => {
    if (entry === name && options.create && !directory.entries.has(entry)) {
      throw new DOMException(`${name} cannot be created`, "QuotaExceededError");
    }
    return get(entry, options);
  };
};

const failWrites = (file: MemoryFile, ...nth: number[]) => {
  const access = file.createSyncAccessHandle.bind(file);
  let writes = 0;
  file.createSyncAccessHandle = async () => {
    const handle = await access();
    return {
      ...handle,
      write: (data: DataView | Uint8Array) => {
        writes += 1;
        if (nth.includes(writes)) {
          throw new DOMException("disk full", "QuotaExceededError");
        }
        return handle.write(data);
      },
    };
  };
};

it("tells the author nothing changed when a rename with references is rolled back whole", async () => {
  const h = await harness();
  failWrites(h.fileAt("main.sd"), 1);
  expect(await h.rename()).toEqual({ renamed: false });
  expect(h.snackbar.value?.message).toBe("Couldn't rename a.png. Nothing was changed.");
  expect(await h.read("main.sd")).toBe("see a");
  expect([...h.assets.entries.keys()]).toEqual(["a.png"]);
}, 15_000);

it("names the files left changed when the rollback of a rename with references is partial", async () => {
  const h = await harness();
  failWrites(h.fileAt("main.sd"), 1);
  failCreating(h.assets, "a.png");
  expect(await h.rename()).toEqual({ renamed: false });
  expect(h.snackbar.value?.message).toBe(
    "Couldn't rename a.png, and these files may be left changed: assets/a.png, assets/b.png.",
  );
  expect([...h.assets.entries.keys()]).toEqual(["b.png"]);
  expect(await h.read("main.sd")).toBe("see a");
}, 15_000);

it("leaves a script saved with the renamed text during a failed rename as it was saved", async () => {
  const h = await harness();
  const zz = (h.fileAt("scripts") as unknown as MemoryDirectory).entries.get("zz.sd") as MemoryFile;
  zz.createSyncAccessHandle = async () => {
    await h.write("main.sd", "see b");
    throw new DOMException("The script could not be written", "NoModificationAllowedError");
  };
  expect(await h.rename()).toEqual({ renamed: false });
  expect(await h.read("main.sd")).toBe("see b");
  expect(await h.read("scripts/zz.sd")).toBe("see a");
  expect([...h.assets.entries.keys()]).toEqual(["a.png"]);
  expect(h.snackbar.value?.message).toContain("main.sd");
}, 15_000);

it("leaves a renamed picture saved during a failed rename at its saved path", async () => {
  const h = await harness();
  const zz = (h.fileAt("scripts") as unknown as MemoryDirectory).entries.get("zz.sd") as MemoryFile;
  zz.createSyncAccessHandle = async () => {
    await h.write("assets/b.png", "AUTHOR-SAVED-TARGET");
    throw new DOMException("The script could not be written", "NoModificationAllowedError");
  };
  expect(await h.rename()).toEqual({ renamed: false });
  expect([...h.assets.entries.keys()].sort()).toEqual(["a.png", "b.png"]);
  expect(await h.read("assets/b.png")).toBe("AUTHOR-SAVED-TARGET");
  expect(h.snackbar.value?.message).toContain("assets/b.png");
}, 15_000);
