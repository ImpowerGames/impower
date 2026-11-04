import { afterEach, describe, expect, it, vi } from "vitest";
import { unzipSync, zipSync } from "fflate";
import {
  listMemory,
  makeMemoryDirectory,
  memoryRoot,
  writeMemoryFile,
  type MemoryDirectory,
} from "../../../packages/opfs-workspace/test/memoryOpfs";
import { buildFileTree } from "../../src/modules/spark-editor/utils/fileTree";
import type WorkspaceFileSystemType from "../../src/modules/spark-editor/workspace/WorkspaceFileSystem";

const PROJECT = "local";
const enc = new TextEncoder();
const dec = new TextDecoder();

const settings = {
  scriptFiles: "*.{sd,luau}",
  imageFiles: "*.{png,jpg,jpeg,gif,webp,svg}",
  audioFiles: "*.{mp3,wav,ogg}",
  videoFiles: "*.{mp4,webm}",
  fontFiles: "*.{ttf,otf,woff,woff2}",
};

let worker: { deliver(message: unknown): void } | undefined;

afterEach(() => {
  worker = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete (navigator as { storage?: unknown }).storage;
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function load(root: MemoryDirectory) {
  vi.resetModules();
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: { getDirectory: async () => root },
  });
  class LoopbackWorker {
    listeners: ((event: { data: unknown }) => void)[] = [];
    onerror = null;
    constructor() {
      worker = this;
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
  vi.stubGlobal("BroadcastChannel", class { onmessage = null; postMessage() {} close() {} });
  vi.stubGlobal("postMessage", (message: unknown) => worker?.deliver(message));
  vi.spyOn(console, "log").mockImplementation(() => {});
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
  return fs;
}

const relativeFiles = async (fs: WorkspaceFileSystemType) =>
  Object.keys(await fs.getFiles(PROJECT))
    .map((uri) => fs.getRelativePath(PROJECT, uri))
    .sort();

const shownTree = async (fs: WorkspaceFileSystemType) => {
  const show = (nodes: ReturnType<typeof buildFileTree>): unknown[] =>
    nodes.map((n) => (n.isDirectory ? { [n.name]: show(n.children) } : n.name));
  return show(
    buildFileTree(
      (await relativeFiles(fs)).filter((p) => !p.startsWith(".")),
      { folders: await fs.getFolders(PROJECT) },
    ),
  );
};

const seed = (files: Record<string, string>, folders: string[] = []) => {
  const root = memoryRoot();
  for (const [path, text] of Object.entries(files)) {
    writeMemoryFile(root, `${PROJECT}/${path}`, enc.encode(text));
  }
  for (const folder of folders) {
    makeMemoryDirectory(root, `${PROJECT}/${folder}`);
  }
  return root;
};

const MIGRATED = { ".layout": "1", ".folders": "1" };

const stored = (root: MemoryDirectory) =>
  listMemory(root, PROJECT).filter((p) => !p.startsWith(".trash"));

describe("empty folders are directories in the workspace store", () => {
  it("creates an empty folder as a directory, reports it, and keeps it across a reload", async () => {
    const root = seed({ "main.sd": "x", ...MIGRATED });
    const fs = await load(root);
    await fs.createFolder(PROJECT, "assets/New Folder");
    expect(stored(root)).toContain("assets/New Folder/");
    expect(stored(root).some((p) => p.endsWith(".folder"))).toBe(false);
    expect(await fs.getFolders(PROJECT)).toEqual(["assets", "assets/New Folder"]);
    expect(await shownTree(fs)).toEqual([
      { assets: [{ "New Folder": [] }] },
      "main.sd",
    ]);
    const reloaded = await load(root);
    expect(await reloaded.getFolders(PROJECT)).toEqual([
      "assets",
      "assets/New Folder",
    ]);
  });

  it("shows a file renamed to .folder, and keeps it across a reload even when it is empty", async () => {
    const root = seed({ "main.sd": "x", ...MIGRATED, "assets/blank.txt": "" });
    const fs = await load(root);
    await fs.moveFile(PROJECT, "assets/blank.txt", "assets/.folder");
    await settle();
    expect(await shownTree(fs)).toEqual([{ assets: [".folder"] }, "main.sd"]);
    const reloaded = await load(root);
    expect(await shownTree(reloaded)).toEqual([
      { assets: [".folder"] },
      "main.sd",
    ]);
  });

  it("renames an empty folder by moving its directory", async () => {
    const root = seed({ "main.sd": "x", ...MIGRATED }, ["assets/a/inner"]);
    const fs = await load(root);
    await fs.moveFolder(PROJECT, "assets/a", "assets/b");
    expect(stored(root).filter((p) => p.startsWith("assets"))).toEqual([
      "assets/",
      "assets/b/",
      "assets/b/inner/",
    ]);
    expect(await fs.getFolders(PROJECT)).toEqual([
      "assets",
      "assets/b",
      "assets/b/inner",
    ]);
  });

  it("deletes a folder's files and its directories, and reports the folders removed", async () => {
    const root = seed(
      { "main.sd": "x", ...MIGRATED, "assets/a/x.png": "p" },
      ["assets/a/inner"],
    );
    const fs = await load(root);
    const deleted = await fs.deleteFolder(PROJECT, "assets/a", "permanent");
    expect(deleted.files.map((f) => f.uri)).toEqual(["file://local/assets/a/x.png"]);
    expect([...deleted.folders].sort()).toEqual(["assets/a", "assets/a/inner"]);
    expect(stored(root).filter((p) => p.startsWith("assets"))).toEqual(["assets/"]);
    expect(await fs.getFolders(PROJECT)).toEqual(["assets"]);
  });
});

describe("opening a project stored with .folder files", () => {
  it("turns each empty .folder file into a directory and leaves no stray .folder", async () => {
    const root = seed(
      {
        "main.sd": "x",
        ".layout": "1",
        "assets/empty/.folder": "",
        "scripts/chapters/.folder": "",
        "scripts/chapters/intro.sd": "y",
        "assets/notes/.folder": "mine",
      },
      ["assets/old/older"],
    );
    const fs = await load(root);
    expect(stored(root)).toEqual([
      ".folders",
      ".layout",
      "assets/",
      "assets/empty/",
      "assets/notes/",
      "assets/notes/.folder",
      "main.sd",
      "scripts/",
      "scripts/chapters/",
      "scripts/chapters/intro.sd",
    ]);
    expect(await shownTree(fs)).toEqual([
      { assets: [{ empty: [] }, { notes: [".folder"] }] },
      { scripts: [{ chapters: ["intro.sd"] }] },
      "main.sd",
    ]);
    expect(dec.decode(await fs.readFile({ file: { uri: "file://local/.folders" } }))).toBe("1");
    expect(dec.decode(await fs.readFile({ file: { uri: "file://local/.layout" } }))).toBe("1");
  });

  it("still opens the project when a .folder file is already gone, as when another tab removed it first", async () => {
    const root = seed({ "main.sd": "x", ".layout": "1", "assets/gone/.folder": "" });
    const gone = (root.entries.get(PROJECT) as MemoryDirectory).entries.get("assets") as MemoryDirectory;
    const folder = gone.entries.get("gone") as MemoryDirectory;
    folder.removeEntry = async () => {
      folder.entries.clear();
      throw new DOMException("already removed", "NotFoundError");
    };
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fs = await load(root);
    expect(await shownTree(fs)).toEqual([{ assets: [{ gone: [] }] }, "main.sd"]);
    expect(dec.decode(await fs.readFile({ file: { uri: "file://local/.folders" } }))).toBe("1");
  });

  it("runs once: an empty .folder made after the migration survives later loads", async () => {
    const root = seed({ "main.sd": "x", ".layout": "1", "assets/empty/.folder": "" });
    const fs = await load(root);
    await fs.createFiles({
      files: [{ uri: "file://local/assets/empty/.folder", data: new ArrayBuffer(0) }],
    });
    const reloaded = await load(root);
    expect(await shownTree(reloaded)).toEqual([
      { assets: [{ empty: [".folder"] }] },
      "main.sd",
    ]);
  });

  it("lays out an unmarked project, keeps its empty folders, holds a move onto one, and removes the folders the moves emptied", async () => {
    const root = seed(
      {
        "main.sd": "x",
        "hero.png": "h",
        "assets/hero.png/.folder": "",
        "art/bg.png": "b",
        "pics/.folder": "",
      },
      ["leftover"],
    );
    const fs = await load(root);
    expect(stored(root)).toEqual([
      ".folders",
      ".layout",
      "assets/",
      "assets/art/",
      "assets/art/bg.png",
      "assets/hero.png/",
      "hero.png",
      "main.sd",
      "pics/",
    ]);
    expect(await fs.getFolders(PROJECT)).toEqual([
      "assets",
      "assets/art",
      "assets/hero.png",
      "pics",
    ]);
  });
});

describe("zip export and import carry empty folders", () => {
  it("round-trips empty folders as directory entries and replaces the importing project's folders", async () => {
    const source = await load(
      seed({ "main.sd": "x", ...MIGRATED, "assets/x.png": "p" }, [
        "assets/empty",
        "scripts/a/b",
      ]),
    );
    const zip = await source.readProjectZip(PROJECT);
    expect(Object.keys(unzipSync(new Uint8Array(zip))).sort()).toEqual([
      ".layout",
      "assets/empty/",
      "assets/x.png",
      "main.sd",
      "scripts/",
      "scripts/a/",
      "scripts/a/b/",
    ]);
    const targetRoot = seed({ "main.sd": "old", ...MIGRATED }, ["assets/stale"]);
    const target = await load(targetRoot);
    await target.writeProjectZip(PROJECT, zip);
    await settle();
    expect(await target.getFolders(PROJECT)).toEqual([
      "assets",
      "assets/empty",
      "scripts",
      "scripts/a",
      "scripts/a/b",
    ]);
    expect(stored(targetRoot)).toEqual([
      ".folders",
      ".layout",
      "assets/",
      "assets/empty/",
      "assets/x.png",
      "main.sd",
      "scripts/",
      "scripts/a/",
      "scripts/a/b/",
    ]);
  });

  it("imports a zip entry named .folder as a file", async () => {
    const source = await load(
      seed({ "main.sd": "x", ...MIGRATED, "assets/notes.txt": "n" }),
    );
    const zip = await source.zipFiles({
      files: [
        { uri: "file://local/main.sd", path: "main.sd" },
        { uri: "file://local/assets/notes.txt", path: "assets/.folder" },
      ],
    });
    const target = await load(seed({ "main.sd": "old", ...MIGRATED }));
    await target.writeProjectZip(PROJECT, zip);
    await settle();
    expect(await shownTree(target)).toEqual([{ assets: [".folder"] }, "main.sd"]);
  });
});

describe("dotfiles inside folders are ordinary files in exports, imports and Drive sync", () => {
  it("exports a .folder file inside a folder, leaves out the project's own metadata, and an import replaces it", async () => {
    const source = await load(
      seed({
        ...MIGRATED,
        "main.sd": "x",
        ".name": "Game",
        "assets/notes/.folder": "keep me",
      }),
    );
    const zip = await source.readProjectZip(PROJECT);
    expect(Object.keys(unzipSync(new Uint8Array(zip))).sort()).toEqual([
      ".layout",
      "assets/notes/.folder",
      "main.sd",
    ]);
    const targetRoot = seed({
      ...MIGRATED,
      "main.sd": "old",
      ".name": "Other",
      "assets/old/.hidden": "stale",
    });
    const target = await load(targetRoot);
    await target.writeProjectZip(PROJECT, zip);
    await settle();
    expect(stored(targetRoot)).toEqual([
      ".folders",
      ".layout",
      ".name",
      "assets/",
      "assets/notes/",
      "assets/notes/.folder",
      "main.sd",
    ]);
    expect(
      dec.decode(await target.readFile({ file: { uri: "file://local/assets/notes/.folder" } })),
    ).toBe("keep me");
  });

  it("carries a .folder file inside a folder through the Drive text bundle", async () => {
    const local = await load(
      seed({ ...MIGRATED, "main.sd": "x", ".name": "Game", "assets/notes/.folder": "keep me" }),
    );
    const bundle = await local.readProjectScriptBundle(PROJECT);
    expect(bundle).toContain("assets/notes/.folder");
    expect(bundle).not.toContain(".name");
    const remoteRoot = seed({ ...MIGRATED, "main.sd": "old", "scripts/gone.txt": "g" });
    const remote = await load(remoteRoot);
    await remote.writeProjectScriptBundle(PROJECT, bundle);
    await settle();
    expect(stored(remoteRoot)).toContain("assets/notes/.folder");
    expect(stored(remoteRoot)).not.toContain("scripts/gone.txt");
  });
});

describe("importing a zip without the layout marker", () => {
  it("lays the imported files out on the reload and keeps the zip's empty folders and empty .folder files", async () => {
    const enc8 = (t: string) => enc.encode(t);
    const zip = zipSync(
      {
        "main.sd": enc8("x"),
        "hero.png": enc8("h"),
        "art/bg.png": enc8("b"),
        "assets/empty/": new Uint8Array(0),
        "assets/notes/.folder": new Uint8Array(0),
      },
      { level: 0 },
    ).buffer as ArrayBuffer;
    const root = seed({ ...MIGRATED, "main.sd": "old" });
    const before = await load(root);
    await before.writeProjectZip(PROJECT, zip);
    await settle();
    await load(root);
    expect(stored(root)).toEqual([
      ".folders",
      ".layout",
      "assets/",
      "assets/art/",
      "assets/art/bg.png",
      "assets/empty/",
      "assets/hero.png",
      "assets/notes/",
      "assets/notes/.folder",
      "main.sd",
    ]);
  });
});

describe("Drive sync's asset bundle carries empty folders", () => {
  it("pushes empty folders as directory entries and a pull creates and removes them", async () => {
    const local = await load(
      seed({ "main.sd": "x", ...MIGRATED, "assets/x.png": "p" }, ["assets/empty"]),
    );
    const bundle = await local.readProjectAssetBundle(PROJECT);
    expect(Object.keys(unzipSync(new Uint8Array(bundle)))).toContain("assets/empty/");
    const remoteRoot = seed(
      { "main.sd": "x", ...MIGRATED, "scripts/s.sd": "s" },
      ["assets/gone"],
    );
    const remote = await load(remoteRoot);
    await remote.writeProjectAssetBundle(PROJECT, bundle);
    expect(await remote.getFolders(PROJECT)).toEqual([
      "assets",
      "assets/empty",
      "scripts",
    ]);
    expect(stored(remoteRoot)).toContain("scripts/s.sd");
  });
});
