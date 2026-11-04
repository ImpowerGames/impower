import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listMemory,
  makeMemoryDirectory,
  memoryRoot,
  writeMemoryFile,
  MemoryDirectory,
  MemoryFile,
} from "../../../packages/opfs-workspace/test/memoryOpfs";
import { allocateCommit } from "../../../packages/opfs-workspace/src/utils/commitSequence";
import type WorkspaceFileSystemType from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";

const PROJECT = "local";
const enc = new TextEncoder();
const dec = new TextDecoder();
const uriOf = (path: string) => `file://${PROJECT}/${path}`;

const settings = {
  scriptFiles: "*.{sd,luau}",
  imageFiles: "*.{png,jpg,jpeg,gif,webp,svg}",
  audioFiles: "*.{mp3,wav,ogg}",
  videoFiles: "*.{mp4,webm}",
  fontFiles: "*.{ttf,otf,woff,woff2}",
};

let pages: { deliver(message: unknown): void }[] = [];

afterEach(() => {
  pages = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { storage?: unknown }).storage;
  delete (navigator as { locks?: unknown }).locks;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const memoryLocks = () => {
  const tails = new Map<string, Promise<void>>();
  return {
    request: async <T>(name: string, task: () => Promise<T>): Promise<T> => {
      const previous = tails.get(name) ?? Promise.resolve();
      let release!: () => void;
      const done = new Promise<void>((resolve) => {
        release = resolve;
      });
      tails.set(name, previous.then(() => done));
      await previous;
      try {
        return await task();
      } finally {
        release();
      }
    },
  };
};

const MIGRATED = { ".layout": "1", ".folders": "1" };

const seed = (files: Record<string, string>, folders: string[] = []) => {
  const root = memoryRoot();
  for (const [path, text] of Object.entries({ ...MIGRATED, ...files })) {
    writeMemoryFile(root, `${PROJECT}/${path}`, enc.encode(text));
  }
  for (const folder of folders) {
    makeMemoryDirectory(root, `${PROJECT}/${folder}`);
  }
  return root;
};

const entryAt = (root: MemoryDirectory, path: string) =>
  `${PROJECT}/${path}`
    .split("/")
    .reduce<MemoryDirectory | MemoryFile | undefined>(
      (dir, name) =>
        dir instanceof MemoryDirectory ? dir.entries.get(name) : undefined,
      root,
    );

const textAt = (root: MemoryDirectory, path: string) => {
  const entry = entryAt(root, path);
  return entry instanceof MemoryFile ? dec.decode(entry.bytes) : undefined;
};

const fileData = (path: string, text: string) => ({
  uri: uriOf(path),
  name: path.replace(/[.][^.]*$/, ""),
  ext: path.split(".").pop(),
  type: "script",
  src: `/file:/${PROJECT}/${path}`,
  version: 1,
  size: enc.encode(text).byteLength,
  modified: 1,
  languageId: "sparkdown",
  text,
});

const otherTab = (root: MemoryDirectory) => {
  let clock = 0;
  const commit = async () => {
    const stamp = await allocateCommit(
      root as unknown as FileSystemDirectoryHandle,
      "other-tab",
      clock,
    );
    clock = stamp.sequence;
    return stamp;
  };
  return {
    commit,
    async write(path: string, text: string) {
      writeMemoryFile(root, `${PROJECT}/${path}`, enc.encode(text));
      return commit();
    },
    async remove(path: string) {
      const parts = `${PROJECT}/${path}`.split("/");
      const parent = parts
        .slice(0, -1)
        .reduce<MemoryDirectory>(
          (dir, name) => dir.entries.get(name) as MemoryDirectory,
          root,
        );
      await parent.removeEntry(parts[parts.length - 1]!);
      return commit();
    },
  };
};

async function load(root: MemoryDirectory) {
  vi.resetModules();
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { getDirectory: async () => root },
  });
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: memoryLocks(),
  });
  let channel: { onmessage: ((event: { data: unknown }) => void) | null } | undefined;
  class LoopbackWorker {
    listeners: ((event: { data: unknown }) => void)[] = [];
    onerror = null;
    constructor() {
      pages.push(this);
    }
    addEventListener(_type: string, listener: (event: { data: unknown }) => void) {
      this.listeners.push(listener);
    }
    postMessage(message: unknown) {
      const data = structuredClone(message);
      setTimeout(() => void (globalThis as any).onmessage({ data }), 0);
    }
    deliver(message: unknown) {
      const data = structuredClone(message);
      setTimeout(() => this.listeners.forEach((listener) => listener({ data })), 0);
    }
  }
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  });
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, {
      createObjectURL: () => "blob:test",
      revokeObjectURL: () => {},
    }),
  );
  vi.stubGlobal("Worker", LoopbackWorker);
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage = null;
      constructor() {
        channel = this;
      }
      postMessage() {}
      close() {}
    },
  );
  vi.stubGlobal("postMessage", (message: unknown) =>
    pages.forEach((page) => page.deliver(message)),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../../../packages/opfs-workspace/src/opfs-workspace");
  await (globalThis as any).onmessage({
    data: { jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings } },
  });
  const { default: WorkspaceFileSystem } = await import(
    "../../src/modules/spark-editor/workspace/WorkspaceFileSystem"
  );
  const ls = {
    connection: { onRequest() {}, sendNotification() {} },
    start: async () => {},
  };
  const fs: WorkspaceFileSystemType = new WorkspaceFileSystem(
    ls as never,
    { settings } as never,
  );
  await fs.getFiles(PROJECT);
  await settle();
  const remote = async (method: string, params: Record<string, unknown>) => {
    channel!.onmessage!({
      data: { jsonrpc: "2.0", method, params: { ...params, remote: true } },
    });
    await settle();
  };
  const toPage = async (method: string, params: Record<string, unknown>) => {
    pages.forEach((page) => page.deliver({ jsonrpc: "2.0", method, params }));
    await settle();
  };
  const textOf = async (path: string) =>
    (await fs.getFiles(PROJECT))[uriOf(path)]?.text;
  return { fs, remote, toPage, textOf };
}

const writeText = (
  fs: WorkspaceFileSystemType,
  path: string,
  text: string,
  origin?: string,
) =>
  fs.writeTextDocument({
    textDocument: { uri: uriOf(path), version: 2, text },
    origin,
  });

describe("the page's file cache across tabs (I-1893)", () => {
  it("keeps this tab's newer text when another tab's older snapshot arrives late", async () => {
    const root = seed({ "main.sd": "A" });
    const h = await load(root);
    const older = await otherTab(root).write("main.sd", "OLDER");
    await writeText(h.fs, "main.sd", "NEWER", "editor");
    await settle();
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("main.sd", "OLDER")],
      commits: { [uriOf("main.sd")]: older },
    });
    expect(await h.textOf("main.sd")).toBe("NEWER");
    expect(textAt(root, "main.sd")).toBe("NEWER");
  });

  it("takes another tab's newer text", async () => {
    const root = seed({ "main.sd": "A" });
    const h = await load(root);
    await writeText(h.fs, "main.sd", "LOCAL", "editor");
    await settle();
    const newer = await otherTab(root).write("main.sd", "REMOTE");
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("main.sd", "REMOTE")],
      commits: { [uriOf("main.sd")]: newer },
    });
    expect(await h.textOf("main.sd")).toBe("REMOTE");
  });

  it("drops a notification older than the one it holds even when it reaches the page directly", async () => {
    const root = seed({ "main.sd": "A" });
    const h = await load(root);
    await h.toPage("workspace/didWriteFiles", {
      files: [fileData("main.sd", "FIVE")],
      remote: true,
      commits: { [uriOf("main.sd")]: { sequence: 5, writer: "b" } },
    });
    await h.toPage("workspace/didWriteFiles", {
      files: [fileData("main.sd", "THREE")],
      remote: true,
      commits: { [uriOf("main.sd")]: { sequence: 3, writer: "z" } },
    });
    await h.toPage("workspace/didWriteFiles", {
      files: [fileData("main.sd", "FIVE-A")],
      remote: true,
      commits: { [uriOf("main.sd")]: { sequence: 5, writer: "a" } },
    });
    await h.toPage("workspace/didDeleteFiles", {
      files: [{ uri: uriOf("main.sd") }],
      remote: true,
      commits: { [uriOf("main.sd")]: { sequence: 4, writer: "z" } },
    });
    expect(await h.textOf("main.sd")).toBe("FIVE");
  });

  it("keeps a file this tab recreated after another tab's earlier delete arrives late", async () => {
    const root = seed({ "main.sd": "A", "a.sd": "A" });
    const h = await load(root);
    const deleted = await otherTab(root).remove("a.sd");
    await h.fs.createFiles({
      files: [{ uri: uriOf("a.sd"), data: enc.encode("AGAIN").buffer }],
    });
    await settle();
    await h.remote("workspace/didDeleteFiles", {
      files: [{ uri: uriOf("a.sd") }],
      commits: { [uriOf("a.sd")]: deleted },
    });
    expect(await h.textOf("a.sd")).toBe("AGAIN");
  });

  it("keeps a folder this tab deleted when another tab's earlier creation arrives late", async () => {
    const root = seed({ "main.sd": "A" }, ["d"]);
    const h = await load(root);
    const created = await otherTab(root).commit();
    await h.fs.deleteFolders(PROJECT, ["d"]);
    await settle();
    await h.remote("workspace/didChangeDirectories", {
      created: [uriOf("d")],
      deleted: [],
      commits: { [uriOf("d")]: created },
    });
    expect(await h.fs.getFolders(PROJECT)).toEqual([]);
  });
});

describe("the page's first load (I-1893)", () => {
  const openWithHeldFolders = async () => {
    vi.resetModules();
    const local = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => void local.set(key, value),
      removeItem: (key: string) => void local.delete(key),
    });
    let worker!: {
      deliver(data: unknown): void;
      reply(message: any, result: unknown): void;
    };
    let folders: any;
    let announce!: () => void;
    const awaitingFolders = new Promise<void>((resolve) => {
      announce = resolve;
    });
    class HeldWorker {
      listeners: ((event: { data: unknown }) => void)[] = [];
      constructor() {
        worker = this;
      }
      addEventListener(_type: string, listener: (event: { data: unknown }) => void) {
        this.listeners.push(listener);
      }
      deliver(data: unknown) {
        this.listeners.forEach((listener) => listener({ data: structuredClone(data) }));
      }
      reply(message: any, result: unknown) {
        this.deliver({ jsonrpc: "2.0", id: message.id, method: message.method, result });
      }
      postMessage(message: any) {
        if (message.method === "workspace/readDirectoryFiles") {
          queueMicrotask(() =>
            this.reply(message, [
              fileData("main.sd", "LISTED"),
              fileData("gone.sd", "LISTED"),
              fileData(".layout", "1"),
              fileData(".folders", "1"),
            ]),
          );
        } else if (message.method === "workspace/directories") {
          folders = message;
          announce();
        } else if (message.method === "workspace/trashFiles") {
          queueMicrotask(() => this.reply(message, {}));
        }
      }
    }
    vi.stubGlobal("Worker", HeldWorker);
    const { default: WorkspaceFileSystem } = await import(
      "../../src/modules/spark-editor/workspace/WorkspaceFileSystem"
    );
    const fs = new WorkspaceFileSystem(
      { connection: { onRequest() {}, sendNotification() {} }, start: async () => {} } as never,
      { settings } as never,
    );
    await awaitingFolders;
    const finish = async () => {
      worker.reply(folders, { uris: [] });
      return fs.getFiles(PROJECT);
    };
    return { worker, finish };
  };

  it("keeps a newer write and a delete that arrive while the first load is still listing folders", async () => {
    const { worker, finish } = await openWithHeldFolders();
    worker.deliver({
      jsonrpc: "2.0",
      method: "workspace/didWriteFiles",
      params: {
        remote: true,
        files: [fileData("main.sd", "NEWER")],
        commits: { [uriOf("main.sd")]: { sequence: 2, writer: "other-tab" } },
      },
    });
    worker.deliver({
      jsonrpc: "2.0",
      method: "workspace/didDeleteFiles",
      params: {
        remote: true,
        files: [{ uri: uriOf("gone.sd") }],
        commits: { [uriOf("gone.sd")]: { sequence: 3, writer: "other-tab" } },
      },
    });
    const files = await finish();
    expect(files[uriOf("main.sd")]?.text).toBe("NEWER");
    expect(files[uriOf("gone.sd")]).toBeUndefined();
  });
});

describe("folder moves (I-1910)", () => {
  it("loses no file when one file of a folder move cannot be moved", async () => {
    const root = seed(
      { "main.sd": "M", "a/x.sd": "X", "a/y.sd": "Y" },
      ["b/x.sd"],
    );
    const h = await load(root);
    await expect(h.fs.moveFolder(PROJECT, "a", "b")).rejects.toBeTruthy();
    await settle();
    expect(textAt(root, "a/x.sd")).toBe("X");
    expect(textAt(root, "b/y.sd")).toBe("Y");
    expect(listMemory(root, PROJECT).filter((p) => !p.startsWith("."))).toEqual(
      ["a/", "a/x.sd", "b/", "b/x.sd/", "b/y.sd", "main.sd"],
    );
    expect(await h.textOf("a/x.sd")).toBe("X");
    expect(await h.textOf("b/y.sd")).toBe("Y");
    expect(await h.textOf("a/y.sd")).toBeUndefined();
  });
});
