import { afterEach, expect, it, vi } from "vitest";
import { allocateCommit } from "../src/utils/commitSequence";
import {
  listMemory,
  makeMemoryDirectory,
  MemoryDirectory,
  MemoryFile,
  memoryLocks,
  memoryRoot,
  writeMemoryFile,
} from "./memoryOpfs";

const enc = new TextEncoder();
const uri = (path: string) => `file://local/${path}`;
const create = (path: string, text: string) => ({ kind: "create", uri: uri(path), data: enc.encode(text).buffer });
const folder = (kind: "create" | "delete", path: string) => ({ kind, uri: uri(path), folder: true });
const del = (path: string) => ({ kind: "delete", uri: uri(path) });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function harness(files: Record<string, string> = {}) {
  vi.resetModules();
  const root = memoryRoot();
  makeMemoryDirectory(root, "local");
  Object.entries(files).forEach(([path, text]) => writeMemoryFile(root, `local/${path}`, enc.encode(text)));
  const project = root.entries.get("local") as MemoryDirectory;
  let channel: { onmessage: ((event: { data: unknown }) => void) | null } | undefined;
  const messages: any[] = [];
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => root }, locks: memoryLocks() });
  vi.stubGlobal("BroadcastChannel", class {
    onmessage = null;
    constructor() {
      channel = this;
    }
    postMessage() {}
    close() {}
  });
  vi.stubGlobal("postMessage", (message: any) => messages.push(message));
  vi.stubGlobal("onmessage", null);
  vi.stubGlobal("self", globalThis);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../src/opfs-workspace");
  const request = async (id: string, method: string, params: unknown) => {
    await (globalThis as any).onmessage({ data: { jsonrpc: "2.0", id, method, params } });
    const response = messages.find((m) => m.id === id && ("result" in m || "error" in m));
    if (!response) throw new Error(`Missing response ${id}`);
    return response;
  };
  await request("config", "workspace/didChangeConfiguration", { settings: { scriptFiles: "*.sd" } }).catch(() => {});
  const edit = async (changes: unknown[]) =>
    (await request("edit", "workspace/applyWorkspaceEdit", { edit: { documentChanges: changes } })).result;
  const remote = async (method: string, params: unknown) => {
    channel!.onmessage!({ data: { jsonrpc: "2.0", method, params } });
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  const entry = (path: string) =>
    path.split("/").reduce<MemoryDirectory | MemoryFile | undefined>(
      (parent, name) => (parent instanceof MemoryDirectory ? parent.entries.get(name) : undefined),
      project,
    );
  const text = (path: string) => {
    const found = entry(path);
    return found?.kind === "file" ? new TextDecoder().decode(found.bytes) : undefined;
  };
  const failAt = (action: () => Promise<void> = async () => {}) => {
    const get = project.getDirectoryHandle.bind(project);
    project.getDirectoryHandle = async (name, options = {}) => {
      if (name === "fail" && options.create) {
        await action();
        throw new DOMException("the later write fails", "QuotaExceededError");
      }
      return get(name, options);
    };
  };
  const otherTabCommit = () => allocateCommit(root as unknown as FileSystemDirectoryHandle, "other-tab", 0);
  const paths = () => listMemory(root, "local").filter((path) => !path.startsWith(".trash"));
  return { root, request, edit, remote, entry, text, failAt, otherTabCommit, paths };
}

it("restores a file the edit replaced with a folder holding a file", async () => {
  const h = await harness({ "cover.png": "OLD IMAGE" });
  h.failAt();
  const result = await h.edit([del("cover.png"), create("cover.png/new.png", "NEW IMAGE"), create("fail/new.sd", "NEW")]);
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.paths()).toEqual(["cover.png"]);
  expect(h.text("cover.png")).toBe("OLD IMAGE");
});

it("restores nested folders and their file that the edit replaced with a file", async () => {
  const h = await harness({ "cover.png/a/b/notes.sd": "OLD NOTES", "main.sd": "OLD MAIN" });
  h.failAt();
  const result = await h.edit([
    del("cover.png/a/b/notes.sd"),
    folder("delete", "cover.png/a/b"),
    folder("delete", "cover.png/a"),
    folder("delete", "cover.png"),
    create("cover.png", "NEW IMAGE"),
    create("main.sd", "NEW MAIN"),
    create("fail/new.sd", "NEW"),
  ]);
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("cover.png/a/b/notes.sd")).toBe("OLD NOTES");
  expect(h.text("main.sd")).toBe("OLD MAIN");
});

it("reports a complete rollback after removing the empty folder the edit created", async () => {
  const h = await harness({ "main.sd": "OLD MAIN" });
  h.failAt();
  const result = await h.edit([create("main.sd", "NEW MAIN"), folder("create", "empty"), folder("create", "fail")]);
  expect(h.paths()).toEqual(["main.sd"]);
  expect(h.text("main.sd")).toBe("OLD MAIN");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
});

it("keeps another tab's folder inside a folder the edit created", async () => {
  const h = await harness();
  h.failAt(async () => {
    makeMemoryDirectory(h.root, "local/generated/personal");
    const commit = await h.otherTabCommit();
    await h.remote("workspace/didChangeDirectories", {
      created: [uri("generated/personal")],
      deleted: [],
      remote: true,
      commits: { [uri("generated/personal")]: commit },
    });
  });
  const result = await h.edit([folder("create", "generated"), create("fail/new.sd", "NEW")]);
  expect(result.applied).toBe(false);
  expect(h.paths()).toContain("generated/personal/");
  expect(result.rollback.complete).toBe(false);
});

it("keeps another tab's save at a path the edit wrote, even before its broadcast arrives", async () => {
  const h = await harness({ "cover.png/notes.sd": "OLD NOTES" });
  h.failAt(async () => {
    const file = h.entry("cover.png") as MemoryFile;
    file.bytes = enc.encode("OTHER TAB'S SAVED WORK");
    file.lastModified += 1;
    await h.otherTabCommit();
  });
  const result = await h.edit([
    del("cover.png/notes.sd"),
    folder("delete", "cover.png"),
    create("cover.png", "IMPORTED"),
    create("fail/new.sd", "NEW"),
  ]);
  expect(result.applied).toBe(false);
  expect(h.text("cover.png")).toBe("OTHER TAB'S SAVED WORK");
  expect(result.rollback).toMatchObject({ complete: false, kept: [uri("cover.png")] });
});

it("keeps another tab's save at a path the edit wrote once its broadcast has arrived", async () => {
  const h = await harness({ "cover.png/notes.sd": "OLD NOTES" });
  h.failAt(async () => {
    const file = h.entry("cover.png") as MemoryFile;
    file.bytes = enc.encode("OTHER TAB'S SAVED WORK");
    const commit = await h.otherTabCommit();
    await h.remote("workspace/didWriteFiles", {
      files: [{ uri: uri("cover.png"), text: "OTHER TAB'S SAVED WORK", type: "image", version: 1 }],
      remote: true,
      commits: { [uri("cover.png")]: commit },
    });
  });
  const result = await h.edit([
    del("cover.png/notes.sd"),
    folder("delete", "cover.png"),
    create("cover.png", "IMPORTED"),
    create("fail/new.sd", "NEW"),
  ]);
  expect(result.rollback.complete).toBe(false);
  expect(result.rollback.kept).toContain(uri("cover.png"));
  expect(h.text("cover.png")).toBe("OTHER TAB'S SAVED WORK");
});

it("reports a folder it cannot clear before restoring a file, and keeps the edit's file in the Trash", async () => {
  const h = await harness({ "cover.png": "OLD IMAGE", "main.sd": "OLD MAIN" });
  h.failAt(async () => {
    const directory = h.entry("cover.png") as MemoryDirectory;
    const remove = directory.removeEntry.bind(directory);
    directory.removeEntry = async (name, options) => {
      if (name === "new.png") throw new DOMException("cannot clear", "NoModificationAllowedError");
      return remove(name, options);
    };
  });
  const result = await h.edit([
    del("cover.png"),
    create("main.sd", "NEW MAIN"),
    create("cover.png/new.png", "NEW IMAGE"),
    create("fail/new.sd", "NEW"),
  ]);
  expect(result.rollback.complete).toBe(false);
  expect(result.rollback.failed).toContain(uri("cover.png"));
  expect(result.rollback.trashed).toContain(uri("cover.png/new.png"));
  expect(h.text("cover.png/new.png")).toBe("NEW IMAGE");
});
