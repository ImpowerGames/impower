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
import { SparkdownLanguageServerWorkspace } from "../../../packages/sparkdown-language-server/src/classes/SparkdownLanguageServerWorkspace";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: {} }));
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));

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

async function harness(
  extra: Record<string, string> = {},
  saved: Record<string, string> = PROJECT,
  options: { firstLoadFails?: boolean } = {},
) {
  vi.resetModules();
  const root = memoryRoot();
  for (const [path, text] of Object.entries({ ...MIGRATED, ...saved, ...extra })) {
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
  const watchers: ((params: unknown) => Promise<void>)[] = [];
  const pending: Promise<void>[] = [];
  const ls = {
    connection: {
      onRequest() {},
      sendNotification: (method: string, params: unknown) => {
        if (method === "workspace/didChangeWatchedFiles") {
          pending.push(...watchers.map((watcher) => watcher(params)));
        }
      },
    },
    start: async () => {},
  };
  if (options.firstLoadFails) {
    vi.spyOn(WorkspaceFileSystem.prototype as any, "openProjectStore").mockRejectedValueOnce(new Error("transient"));
  }
  const fs = new WorkspaceFileSystem(ls as never, { settings, onDidChange: () => () => {} } as never);
  const starterReadWhileLoading = fs.getFileText("file://local/main.sd").catch((error: unknown) => error);
  let starterReadDuringRetry: Promise<unknown> | undefined;
  if (options.firstLoadFails) {
    await fs.getFiles("local").catch(() => undefined);
    const retry = fs.getFiles("local");
    starterReadDuringRetry = fs.getFileText("file://local/main.sd").catch((error: unknown) => error);
    await retry;
  } else {
    await fs.getFiles("local");
  }
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
  const applyBundle = async (apply: () => Promise<unknown>) => {
    try {
      await apply();
      return {};
    } catch (error) {
      return { error };
    }
  };
  const applyScripts = (content: string) =>
    applyBundle(() => fs.writeProjectScriptBundle("local", content));
  const applyAssets = (content: ArrayBuffer) =>
    applyBundle(() => fs.writeProjectAssetBundle("local", content));
  return { fs, starterReadWhileLoading, starterReadDuringRetry, watchers, pending, root, project, stored, text, failCreatingFolder, failRemoving, failWrites, importBackup, applyScripts, applyAssets, ProjectImportError };
}

const ASSETS = { "art/old.png": "OLD" };

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

it("restores the folders marker when a backup holding a marker fails on the import's own marker write", async () => {
  const h = await harness();
  const before = h.stored();
  const original = MemoryFile.prototype.createSyncAccessHandle;
  let writes = 0;
  vi.spyOn(MemoryFile.prototype, "createSyncAccessHandle").mockImplementation(async function (this: MemoryFile) {
    const handle = await original.call(this);
    if (this.name !== ".folders") return handle;
    return {
      ...handle,
      write: (data: DataView | Uint8Array) => {
        writes += 1;
        if (writes === 2) throw new DOMException("one transient I/O failure", "UnknownError");
        return handle.write(data);
      },
    };
  });
  const { error } = await h.importBackup(backup({ ...BACKUP, ".folders": "backup marker" }));
  expect(writes).toBeGreaterThanOrEqual(3);
  expect(error?.reason).toBe("storage");
  expect(h.stored()).toEqual(before);
  expect(h.text(".folders")).toBe("1");
  expect(error?.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
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

const SCRIPTS = "the bundle's main\n\n//// chapters/one.sd ////\nchapter one";

it("leaves the project as it was when writing a script bundle fails partway", async () => {
  const h = await harness(ASSETS);
  const before = h.stored();
  h.failWrites("main.sd", 1);
  const { error } = await h.applyScripts(SCRIPTS);
  expect(error).toBeDefined();
  expect(h.stored()).toEqual(before);
  expect(h.text("main.sd")).toBe(PROJECT["main.sd"]);
  expect(h.text("old/notes.sd")).toBe(PROJECT["old/notes.sd"]);
  expect(h.text("art/old.png")).toBe("OLD");
}, 15_000);

it("replaces the project's scripts with the script bundle's and keeps its assets", async () => {
  const h = await harness(ASSETS);
  const { error } = await h.applyScripts(SCRIPTS);
  expect(error).toBeUndefined();
  expect(h.stored()).toEqual(["art/", "art/old.png", "chapters/", "chapters/one.sd", "main.sd", "old/"]);
  expect(h.text("main.sd")).toBe("the bundle's main");
  expect(h.text("chapters/one.sd")).toBe("chapter one");
}, 15_000);

it("leaves the project as it was when writing an asset bundle fails partway", async () => {
  const h = await harness(ASSETS);
  const before = h.stored();
  h.failCreatingFolder("images");
  const { error } = await h.applyAssets(backup({ "images/a.png": "PNG" }));
  expect(error).toBeDefined();
  expect(h.stored()).toEqual(before);
  expect(h.text("art/old.png")).toBe("OLD");
  expect(h.text("main.sd")).toBe(PROJECT["main.sd"]);
  expect(h.text("old/notes.sd")).toBe(PROJECT["old/notes.sd"]);
}, 15_000);

it("leaves the project as it was when creating a folder the asset bundle lists fails", async () => {
  const h = await harness(ASSETS);
  const before = h.stored();
  h.failCreatingFolder("empty");
  const { error } = await h.applyAssets(backup({ "images/a.png": "PNG" }, ["empty"]));
  expect(error).toBeDefined();
  expect(h.stored()).toEqual(before);
  expect(h.text("art/old.png")).toBe("OLD");
}, 15_000);

it("replaces the project's assets and folders with the asset bundle's and keeps its scripts", async () => {
  const h = await harness(ASSETS);
  const { error } = await h.applyAssets(backup({ "images/a.png": "PNG" }, ["empty"]));
  expect(error).toBeUndefined();
  expect(h.stored()).toEqual(["empty/", "images/", "images/a.png", "main.sd", "old/", "old/notes.sd"]);
  expect(h.text("images/a.png")).toBe("PNG");
  expect(h.text("main.sd")).toBe(PROJECT["main.sd"]);
  expect(await h.fs.getFolders("local")).toEqual(["empty", "images", "old"]);
}, 15_000);

it("replaces a folder holding only empty folders with a script bundle file of the same path", async () => {
  const h = await harness(ASSETS);
  const chapters = await h.project.getDirectoryHandle("chapters", { create: true });
  const clash = await chapters.getDirectoryHandle("one.sd", { create: true });
  await (await clash.getDirectoryHandle("empty", { create: true })).getDirectoryHandle("deeper", { create: true });
  const { error } = await h.applyScripts(SCRIPTS);
  expect(error).toBeUndefined();
  expect(h.text("chapters/one.sd")).toBe("chapter one");
  expect(h.stored().filter((path) => path.startsWith("chapters/one.sd/"))).toEqual([]);
}, 15_000);

const STARTER_URI = "file://local/main.sd";

const starterText = async (h: Awaited<ReturnType<typeof harness>>) =>
  (await h.fs.getFiles("local"))[STARTER_URI]?.text;

it("keeps the unsaved starter main in the editor when a script bundle fails after writing main", async () => {
  const h = await harness(ASSETS, {});
  const before = await starterText(h);
  expect(before).toBeDefined();
  expect(h.text("main.sd")).toBeUndefined();
  h.failCreatingFolder("chapters");
  const { error } = await h.applyScripts(SCRIPTS);
  expect(error).toBeDefined();
  expect(h.text("main.sd")).toBeUndefined();
  expect(await starterText(h)).toBe(before);
}, 15_000);

it("keeps the unsaved starter main in the editor when a backup import fails after writing main", async () => {
  const h = await harness({}, {});
  const before = await starterText(h);
  expect(before).toBeDefined();
  h.failCreatingFolder("images");
  const { error } = await h.importBackup(backup(BACKUP));
  expect(error?.reason).toBe("storage");
  expect(h.text("main.sd")).toBeUndefined();
  expect(await starterText(h)).toBe(before);
}, 15_000);

class TestLanguageServer extends SparkdownLanguageServerWorkspace {
  compiled = new Map<string, string | undefined>();

  removals: Promise<void> = Promise.resolve();

  constructor(connection: unknown) {
    super(connection as never);
    this._projectLoaded = true;
    this._compilerConfigured = true;
    this._scriptFilePattern = /[.]sd$/;
    this._compilerChannelConnection = {
      sendRequest: async (type: { method: string }, params: any) => {
        if (type.method === "compiler/removeFile") {
          await this.removals;
          this.compiled.delete(params.file.uri);
        } else if (type.method === "compiler/addFile" || type.method === "compiler/updateFile") {
          this.compiled.set(params.file.uri, params.file.text);
        }
        return { textDocument: params.textDocument };
      },
    } as never;
    this.debouncedCompile = (async () => undefined) as never;
  }

  override startCompilerWorker() {}

  seed(file: { uri: string; text?: string; version?: number; languageId?: string }) {
    const watched = {
      ...file,
      name: this.getFileName(file.uri),
      ext: this.getFileExtension(file.uri),
      type: this.getFileType(file.uri),
    };
    this._watchedFiles.set(file.uri, watched);
    this.onCreatedFile(watched);
    this.compiled.set(file.uri, file.text);
  }

  versionOf(uri: string) {
    return this._documentVersions.get(uri);
  }
}

const languageServer = async (h: Awaited<ReturnType<typeof harness>>, open: string[]) => {
  const connection = new Proxy({}, {
    get: (_target, key) => {
      if (key === "onDidChangeWatchedFiles") {
        return (handler: (params: unknown) => Promise<void>) => {
          h.watchers.push(handler);
          return { dispose() {} };
        };
      }
      if (key === "sendRequest") {
        return (_type: unknown, params: never) => h.fs.executeCommand(params);
      }
      return () => ({ dispose() {} });
    },
  });
  const server = new TestLanguageServer(connection);
  server.listen();
  const files = await h.fs.getFiles("local");
  Object.values(files)
    .filter((file) => file.uri.endsWith(".sd"))
    .forEach((file) => server.seed(file));
  for (const uri of open) {
    await server.openTextDocument({
      textDocument: { uri, languageId: "sparkdown", version: 0, text: files[uri]!.text! },
    });
  }
  return server;
};

const settled = (h: Awaited<ReturnType<typeof harness>>) => Promise.all(h.pending);

it("reads the unsaved starter main while the project is still loading", async () => {
  const h = await harness({}, {});
  expect(await h.starterReadWhileLoading).toBe(await starterText(h));
}, 15_000);

it("reads a saved main from storage while the project is still loading", async () => {
  const h = await harness();
  expect(await h.starterReadWhileLoading).toBe(PROJECT["main.sd"]);
}, 15_000);

it("reads the unsaved starter main while a retried project load is still running", async () => {
  const h = await harness({}, {}, { firstLoadFails: true });
  expect(await h.starterReadDuringRetry).toBe(await starterText(h));
}, 15_000);

it("keeps an edit made after a failed script bundle current in the language server", async () => {
  const h = await harness(ASSETS, {});
  const before = (await starterText(h))!;
  const server = await languageServer(h, [STARTER_URI]);
  let release!: () => void;
  server.removals = new Promise((resolve) => (release = resolve));
  h.failCreatingFolder("chapters");
  const { error } = await h.applyScripts(SCRIPTS);
  expect(error).toBeDefined();
  await server.changeTextDocument({
    textDocument: { uri: STARTER_URI, version: 1 },
    contentChanges: [{ text: `${before}edited` }],
  });
  release();
  await settled(h);
  expect(server.versionOf(STARTER_URI)).toBe(1);
}, 15_000);

it("keeps the unsaved starter main in the language server when a script bundle fails after writing main", async () => {
  const h = await harness(ASSETS, {});
  const before = await starterText(h);
  const server = await languageServer(h, [STARTER_URI]);
  h.failCreatingFolder("chapters");
  const { error } = await h.applyScripts(SCRIPTS);
  expect(error).toBeDefined();
  await settled(h);
  expect(server.document(STARTER_URI)?.getText()).toBe(before);
  expect(server.compiled.get(STARTER_URI)).toBe(before);
}, 15_000);

it("keeps the unsaved starter main in the language server when a backup import fails after writing main", async () => {
  const h = await harness({}, {});
  const before = await starterText(h);
  const server = await languageServer(h, []);
  h.failCreatingFolder("images");
  const { error } = await h.importBackup(backup(BACKUP));
  expect(error?.reason).toBe("storage");
  await settled(h);
  expect(server.document(STARTER_URI)?.getText()).toBe(before);
  expect(server.compiled.get(STARTER_URI)).toBe(before);
}, 15_000);

it("leaves the language server without a file the failed import created", async () => {
  const h = await harness();
  const server = await languageServer(h, []);
  h.failCreatingFolder("images");
  const { error } = await h.importBackup(backup({ "added.sd": "added", ...BACKUP }));
  expect(error?.reason).toBe("storage");
  await settled(h);
  expect(h.text("added.sd")).toBeUndefined();
  expect(server.document("file://local/added.sd")).toBeUndefined();
  expect(server.compiled.has("file://local/added.sd")).toBe(false);
  expect(server.document(STARTER_URI)?.getText()).toBe(PROJECT["main.sd"]);
}, 15_000);
