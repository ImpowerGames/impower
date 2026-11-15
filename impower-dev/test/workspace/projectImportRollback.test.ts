import { zipSync } from "fflate";
import { afterEach, expect, it, vi } from "vitest";
import {
  listMemory,
  MemoryDirectory,
  MemoryFile,
  memoryLocks,
  memoryRoot,
  writeMemoryFile,
} from "../../../packages/opfs-workspace/test/memoryOpfs";
import { buildZippable } from "../../../packages/opfs-workspace/src/utils/assetArchive";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: {} }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { storage?: unknown }).storage;
  delete (navigator as { locks?: unknown }).locks;
});

const bytes = (text: string) => new TextEncoder().encode(text);

const MIGRATED = { ".layout": "1", ".folders": "1" };

const PROJECT = {
  "main.sd": "the old main",
  "old/notes.sd": "the author's notes",
};

const backup = (entries: Record<string, string>, folders: string[] = []) =>
  zipSync(
    {
      ...buildZippable(
        Object.entries(entries).map(([path, text]) => ({ path, data: bytes(text) })),
      ),
      ...Object.fromEntries(folders.map((folder) => [`${folder}/`, new Uint8Array()])),
    },
    { level: 0 },
  ).buffer as ArrayBuffer;

async function harness(extra: Record<string, string> = {}) {
  vi.resetModules();
  const root = memoryRoot();
  for (const [path, text] of Object.entries({ ...MIGRATED, ...PROJECT, ...extra })) {
    writeMemoryFile(root, `local/${path}`, bytes(text));
  }
  Object.defineProperty(navigator, "storage", { configurable: true, value: { getDirectory: async () => root } });
  Object.defineProperty(navigator, "locks", { configurable: true, value: memoryLocks() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("URL", Object.assign(class extends URL {}, {
    createObjectURL: () => "blob:project-import",
    revokeObjectURL: () => undefined,
  }));
  const workers: { deliver(message: unknown): void }[] = [];
  class LoopbackWorker {
    listeners: ((event: { data: unknown }) => void)[] = [];
    constructor() { workers.push(this); }
    addEventListener(_type: string, listener: (event: { data: unknown }) => void) { this.listeners.push(listener); }
    postMessage(message: unknown, transfer?: Transferable[]) {
      const data = structuredClone(message, { transfer });
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
  const { ProjectImportError } = await import("../../src/modules/spark-editor/workspace/projectImport");
  const ls = { connection: { onRequest() {}, sendNotification() {} }, start: async () => {} };
  const fs = new WorkspaceFileSystem(ls as never, { settings, onDidChange: () => () => {} } as never);
  await fs.getFiles("local");
  const project = root.entries.get("local") as MemoryDirectory;
  const stored = () =>
    listMemory(root, "local").filter((path) => !path.startsWith(".") && !path.startsWith("_"));
  const text = (path: string) => {
    let entry: MemoryDirectory | MemoryFile | undefined = project;
    for (const name of path.split("/")) {
      entry = (entry as MemoryDirectory | undefined)?.entries.get(name);
    }
    return entry?.kind === "file" ? new TextDecoder().decode(entry.bytes) : undefined;
  };
  const failCreatingFolder = (name: string) => {
    const get = project.getDirectoryHandle.bind(project);
    project.getDirectoryHandle = async (entry, options = {}) => {
      if (entry === name && options.create && !project.entries.has(entry)) {
        throw new DOMException(`${name} cannot be created`, "QuotaExceededError");
      }
      return get(entry, options);
    };
  };
  const failWrites = (path: string, ...nth: number[]) => {
    const file = project.entries.get(path) as MemoryFile;
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
  const failRemoving = (name: string) => {
    const remove = project.removeEntry.bind(project);
    project.removeEntry = async (entry, options) => {
      if (entry === name) {
        throw new DOMException(`${name} cannot be removed`, "NoModificationAllowedError");
      }
      return remove(entry, options);
    };
  };
  const importBackup = async (content: ArrayBuffer) => {
    try {
      return { result: await fs.writeProjectZip("local", content) };
    } catch (error) {
      return { error: error as InstanceType<typeof ProjectImportError> };
    }
  };
  return { fs, root, project, stored, text, failCreatingFolder, failRemoving, failWrites, importBackup, ProjectImportError };
}

const BACKUP = { ".layout": "1", "main.sd": "the backup's main", "images/a.png": "PNG" };

it("leaves the project as it was when a write of the backup fails partway", async () => {
  const h = await harness();
  const before = h.stored();
  h.failCreatingFolder("images");
  const { error } = await h.importBackup(backup(BACKUP));
  expect(error).toBeInstanceOf(h.ProjectImportError);
  expect(error?.reason).toBe("storage");
  expect(h.stored()).toEqual(before);
  expect(h.text("main.sd")).toBe(PROJECT["main.sd"]);
  expect(h.text("old/notes.sd")).toBe(PROJECT["old/notes.sd"]);
  expect(error?.rollback?.complete).toBe(true);
}, 15_000);

it("puts back an empty folder cleared for a file of the same path when the import fails", async () => {
  const h = await harness();
  await h.fs.createFolder("local", "cover.png");
  const before = h.stored();
  expect(before).toContain("cover.png/");
  h.failCreatingFolder("images");
  const { error } = await h.importBackup(backup({ ...BACKUP, "cover.png": "PNG" }));
  expect(error?.reason).toBe("storage");
  expect(h.stored()).toEqual(before);
  expect(await h.fs.getFolders("local")).toContain("cover.png");
}, 15_000);

it("leaves the project as it was when creating a folder the backup lists fails", async () => {
  const h = await harness();
  const before = h.stored();
  h.failCreatingFolder("empty");
  const { error } = await h.importBackup(backup(BACKUP, ["empty"]));
  expect(error?.reason).toBe("storage");
  expect(h.stored()).toEqual(before);
  expect(h.text("main.sd")).toBe(PROJECT["main.sd"]);
  expect(h.text("old/notes.sd")).toBe(PROJECT["old/notes.sd"]);
  expect(error?.rollback?.complete).toBe(true);
}, 15_000);

it("leaves the project as it was when removing a folder the backup lacks fails", async () => {
  const h = await harness();
  const before = h.stored();
  h.failRemoving("old");
  const { error } = await h.importBackup(backup(BACKUP));
  expect(error?.reason).toBe("storage");
  expect(h.stored()).toEqual(before);
  expect(h.text("main.sd")).toBe(PROJECT["main.sd"]);
  expect(h.text("old/notes.sd")).toBe(PROJECT["old/notes.sd"]);
  expect(error?.rollback?.complete).toBe(true);
}, 15_000);

it("replaces a folder that holds files with a backup file of the same path", async () => {
  const h = await harness({ "cover.png/notes.sd": "folder contents" });
  const { error } = await h.importBackup(backup({ ...BACKUP, "cover.png": "PNG" }));
  expect(error).toBeUndefined();
  expect(h.stored()).toEqual(["cover.png", "images/", "images/a.png", "main.sd"]);
  expect(h.text("cover.png")).toBe("PNG");
  expect(await h.fs.getFolders("local")).toEqual(["images"]);
}, 15_000);

it("puts back a folder that held files when the import that replaced it with a file fails", async () => {
  const h = await harness({ "cover.png/notes.sd": "folder contents" });
  const before = h.stored();
  h.failCreatingFolder("images");
  const { error } = await h.importBackup(backup({ ...BACKUP, "cover.png": "PNG" }));
  expect(error?.reason).toBe("storage");
  expect(h.stored()).toEqual(before);
  expect(h.text("cover.png/notes.sd")).toBe("folder contents");
  expect(error?.rollback?.complete).toBe(true);
}, 15_000);

it("replaces a file with a backup folder of the same path", async () => {
  const h = await harness({ "cover.png": "old image" });
  const { error } = await h.importBackup(
    backup({ ".layout": "1", "main.sd": "the backup's main", "cover.png/new.png": "NEW" }),
  );
  expect(error).toBeUndefined();
  expect(h.stored()).toEqual(["cover.png/", "cover.png/new.png", "main.sd"]);
}, 15_000);

it("puts back a file that the import replaced with a folder holding files when a later write fails", async () => {
  const h = await harness({ "cover.png": "old image" });
  const before = h.stored();
  h.failCreatingFolder("images");
  const { error } = await h.importBackup(
    backup({ ".layout": "1", "main.sd": "the backup's main", "cover.png/new.png": "NEW", "images/a.png": "PNG" }),
  );
  expect(error?.reason).toBe("storage");
  expect(h.stored()).toEqual(before);
  expect(h.text("cover.png")).toBe("old image");
  expect(h.text("main.sd")).toBe(PROJECT["main.sd"]);
  expect(error?.rollback?.complete).toBe(true);
}, 15_000);

it("puts back a file that the import replaced with an empty folder when a later folder fails", async () => {
  const h = await harness({ "cover.png": "old image" });
  const before = h.stored();
  h.failCreatingFolder("zzz");
  const { error } = await h.importBackup(backup(BACKUP, ["cover.png", "zzz"]));
  expect(error?.reason).toBe("storage");
  expect(h.stored()).toEqual(before);
  expect(h.text("cover.png")).toBe("old image");
  expect(error?.rollback?.complete).toBe(true);
}, 15_000);

it("keeps a file saved through the same worker into a folder the failing import had removed", async () => {
  const h = await harness();
  const get = h.project.getDirectoryHandle.bind(h.project);
  h.project.getDirectoryHandle = async (entry, options = {}) => {
    if (entry === "images" && options.create) {
      await h.fs.createFiles({
        files: [{ uri: h.fs.getFileUri("local", "old/extra.sd"), data: bytes("saved meanwhile").buffer }],
      });
      throw new DOMException("images cannot be created", "QuotaExceededError");
    }
    return get(entry, options);
  };
  const { error } = await h.importBackup(backup(BACKUP));
  expect(error?.reason).toBe("storage");
  expect(h.text("old/extra.sd")).toBe("saved meanwhile");
  expect(h.text("old/notes.sd")).toBe(PROJECT["old/notes.sd"]);
  expect(h.text("main.sd")).toBe(PROJECT["main.sd"]);
}, 15_000);

it("reports the rollback incomplete when a folder the import removed cannot be put back", async () => {
  const h = await harness();
  await h.fs.createFolder("local", "cover.png");
  h.failCreatingFolder("images");
  h.failCreatingFolder("cover.png");
  const { error } = await h.importBackup(backup({ ...BACKUP, "cover.png": "PNG" }));
  expect(error?.reason).toBe("storage");
  expect(h.text("old/notes.sd")).toBe(PROJECT["old/notes.sd"]);
  expect(error?.rollback?.complete).toBe(false);
  expect(error?.rollback?.failed).toEqual(expect.arrayContaining(["cover.png", "main.sd"]));
}, 15_000);

it("carries the rollback's outcome in the import error when the rollback is partial", async () => {
  const h = await harness();
  h.failCreatingFolder("images");
  h.failWrites("main.sd", 2);
  const { error } = await h.importBackup(backup(BACKUP));
  expect(error).toBeInstanceOf(h.ProjectImportError);
  expect(error?.reason).toBe("storage");
  expect(h.text("old/notes.sd")).toBe(PROJECT["old/notes.sd"]);
  expect(error?.rollback).toMatchObject({ complete: false, failed: ["main.sd"] });
}, 15_000);

it("replaces the project's files and folders with the backup's when every write succeeds", async () => {
  const h = await harness();
  const { result, error } = await h.importBackup(
    backup({ ...BACKUP, ".vscode/settings.json": '{"a":1}' }, ["empty"]),
  );
  expect(error).toBeUndefined();
  expect(result?.settingsJson).toBe('{"a":1}');
  expect(h.stored()).toEqual(["empty/", "images/", "images/a.png", "main.sd"]);
  expect(h.text("main.sd")).toBe(BACKUP["main.sd"]);
  expect(h.text("images/a.png")).toBe("PNG");
  expect(h.text(".folders")).toBe("1");
  expect(await h.fs.getFolders("local")).toEqual(["empty", "images"]);
}, 15_000);
