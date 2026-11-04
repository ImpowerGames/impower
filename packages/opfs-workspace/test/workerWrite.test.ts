import { afterEach, expect, it, vi } from "vitest";
import { getOrCreateThumbnail } from "@impower/sparkdown/src/thumbnails/composeThumbnail";
import { COMMIT_SEQUENCE_FILE } from "../src/utils/commitSequence";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

async function worker({ existing = true, fail = "", acquire = async () => {}, remove = async (_name: string) => {}, thumbnail: thumbnailGate = undefined as Promise<void> | undefined } = {}) {
  vi.resetModules();
  vi.useFakeTimers();
  const messages: any[] = [];
  let bytes = new Uint8Array([9]);
  let exists = existing;
  let locked = false;
  const close = vi.fn(() => { locked = false; });
  const removeEntry = vi.fn(async (name: string) => { await remove(name); exists = false; });
  const thumbnails: string[] = [];
  const thumbnailCache = new Map<string, Response>();
  const decode = vi.fn(async () => { await thumbnailGate; return { width: 2, height: 2, close() {} }; });
  if (thumbnailGate) {
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("OffscreenCanvas", class {
      getContext() { return { drawImage() {} }; }
      async convertToBlob() { return new Blob(["thumbnail"], { type: "image/webp" }); }
    });
    vi.stubGlobal("caches", { open: async () => ({
      match: async (key: string) => thumbnailCache.get(key),
      put: async (key: string, response: Response) => { thumbnails.push(key); thumbnailCache.set(key, response); },
    }) });
  }
  const file = {
    createSyncAccessHandle: vi.fn(async () => {
      await acquire();
      if (locked) throw new DOMException("already locked", "NoModificationAllowedError");
      locked = true;
      return {
        truncate: vi.fn(() => { bytes = new Uint8Array(); }),
        write: vi.fn((data: DataView | Uint8Array) => {
          if (fail === "write") throw new DOMException("full", "QuotaExceededError");
          bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice();
          return fail === "short" ? bytes.length - 1 : bytes.length;
        }),
        flush: vi.fn(),
        close,
      };
    }),
    getFile: async () => ({ size: bytes.length, lastModified: 1, arrayBuffer: async () => bytes.slice().buffer }),
  };
  let sequence = new Uint8Array();
  const sequenceFile = {
    getFile: async () => ({ text: async () => new TextDecoder().decode(sequence) }),
    createSyncAccessHandle: async () => ({
      truncate: () => { sequence = new Uint8Array(); },
      write: (data: Uint8Array) => { sequence = data.slice(); return data.length; },
      flush: () => {},
      close: () => {},
    }),
  };
  const directory: any = {
    getDirectoryHandle: async () => directory,
    getFileHandle: async (name: string, options: { create?: boolean } = {}) => {
      if (name === COMMIT_SEQUENCE_FILE) return sequenceFile;
      if (fail === "lookup") throw new DOMException("locked lookup", "NotAllowedError");
      if (!exists && !options.create) throw new DOMException("missing", "NotFoundError");
      exists = true;
      return file;
    },
    removeEntry,
  };
  vi.stubGlobal("navigator", { locks: memoryLocks(), storage: { getDirectory: async () => {
    if (fail === "root") throw new DOMException("denied", "NotAllowedError");
    return directory;
  } } });
  vi.stubGlobal("BroadcastChannel", class { onmessage = null; postMessage() {} close() {} });
  vi.stubGlobal("postMessage", (message: any) => messages.push(message));
  vi.stubGlobal("onmessage", null);
  vi.stubGlobal("self", globalThis);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../src/opfs-workspace");
  const request = async (id: string, method: string, params: any, elapsed = 101) => {
    void (globalThis as any).onmessage({ data: { jsonrpc: "2.0", id, method, params } });
    await vi.advanceTimersByTimeAsync(elapsed);
    return messages.find(message => message.id === id && ("result" in message || "error" in message));
  };
  const send = (id: string, data = [1, 2, 3], uri = "file://local/main.sd", elapsed = 101) => request(id, "workspace/willCreateFiles", { files: [{ uri, data: new Uint8Array(data).buffer }] }, elapsed);
  return { send, request, messages, close, removeEntry, thumbnails, thumbnailCache, decode, file, exists: () => exists, locked: () => locked, bytes: () => bytes };
}

it("answers successful imports on the real worker message handler", async () => {
  const h = await worker();
  expect(await h.send("ok")).toMatchObject({ result: [{ uri: "file://local/main.sd" }] });
  expect(h.bytes()).toEqual(new Uint8Array([1, 2, 3]));
  expect(h.close).toHaveBeenCalledTimes(1);
});

it("acknowledges explicit creates without the editing debounce", async () => {
  const h = await worker();
  expect(await h.send("immediate", [1], "file://local/main.sd", 0)).toEqual(expect.objectContaining({ result: expect.any(Array) }));
});

it("retains the debounce for ordinary file edits", async () => {
  const h = await worker();
  expect(await h.request("edit", "workspace/willWriteFiles", { files: [{ uri: "file://local/main.sd", version: 1, data: new Uint8Array([4]).buffer }] }, 0)).toBeUndefined();
  await vi.advanceTimersByTimeAsync(101);
  expect(h.messages.find(message => message.id === "edit")).toHaveProperty("result");
});

it("echoes a write's origin into its write notification and omits it for writes without one", async () => {
  const h = await worker();
  await h.request("tagged", "workspace/willWriteFiles", { files: [{ uri: "file://local/main.sd", version: 1, data: new Uint8Array([4]).buffer }], origin: "editor" });
  await h.request("untagged", "workspace/willWriteFiles", { files: [{ uri: "file://local/main.sd", version: 2, data: new Uint8Array([5]).buffer }] });
  const notifications = h.messages.filter(message => message.method === "workspace/didWriteFiles");
  expect(notifications.map(message => message.params.origin)).toEqual(["editor", undefined]);
});

const writeRequest = (data: number[], origin?: string) => ({ files: [{ uri: "file://local/main.sd", version: 1, data: new Uint8Array(data).buffer }], origin });
const didWrites = (messages: any[]) => messages.filter(message => message.method === "workspace/didWriteFiles").map(message => ({ origin: message.params.origin, bytes: message.params.files.map((f: any) => f.size) }));

it("commits an untagged write before the editor's autosave that follows it and attributes each to its own writer", async () => {
  const h = await worker();
  await h.request("external", "workspace/willWriteFiles", writeRequest([1]), 0);
  await h.request("autosave", "workspace/willWriteFiles", writeRequest([1, 2], "editor"));
  expect(h.bytes()).toEqual(new Uint8Array([1, 2]));
  expect(h.messages.find(message => message.id === "external").result[0].size).toBe(1);
  expect(h.messages.find(message => message.id === "autosave").result[0].size).toBe(2);
  expect(didWrites(h.messages).at(-1)).toEqual({ origin: "editor", bytes: [2] });
  expect(didWrites(h.messages).some(write => write.origin === undefined && write.bytes[0] === 2)).toBe(false);
});

it("does not attribute an untagged write that follows the editor's autosave to the editor", async () => {
  const h = await worker();
  await h.request("autosave", "workspace/willWriteFiles", writeRequest([1, 2], "editor"), 0);
  await h.request("external", "workspace/willWriteFiles", writeRequest([3]));
  expect(h.bytes()).toEqual(new Uint8Array([3]));
  expect(h.messages.find(message => message.id === "autosave").result[0].size).toBe(2);
  expect(didWrites(h.messages).at(-1)).toEqual({ origin: undefined, bytes: [1] });
  expect(didWrites(h.messages).some(write => write.origin === "editor" && write.bytes[0] === 1)).toBe(false);
});

it("commits a workspace edit before the editor's autosave that follows it", async () => {
  const h = await worker();
  void (globalThis as any).onmessage({ data: { jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings: { scriptFiles: "*.sd" } } } });
  await h.send("create", [65]);
  const before = h.messages.length;
  await h.request("edit", "workspace/applyWorkspaceEdit", { edit: { documentChanges: [{ textDocument: { uri: "file://local/main.sd", version: null }, edits: [{ range: { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } }, newText: "B" }] }] } }, 0);
  await h.request("autosave", "workspace/willWriteFiles", writeRequest([65, 66, 67], "editor"));
  await vi.advanceTimersByTimeAsync(0);
  expect(h.messages.find(message => message.id === "edit")).toMatchObject({ result: { applied: true } });
  expect(h.messages.find(message => message.id === "autosave")).toHaveProperty("result");
  expect(h.bytes()).toEqual(new Uint8Array([65, 66, 67]));
  expect(didWrites(h.messages.slice(before)).at(-1)).toEqual({ origin: "editor", bytes: [3] });
  expect(didWrites(h.messages.slice(before)).some(write => write.origin === "editor" && write.bytes[0] !== 3)).toBe(false);
});

const gatedWorker = async () => {
  let blockAt = 0;
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const h = await worker({ acquire: async () => { calls += 1; if (calls === blockAt) await gate; } });
  void (globalThis as any).onmessage({ data: { jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings: { scriptFiles: "*.sd" } } } });
  return { ...h, blockCall: (offset: number) => { blockAt = calls + offset; }, release };
};
const insertAtEnd = (uri: string, character: number, newText: string) => ({ textDocument: { uri, version: null }, edits: [{ range: { start: { line: 0, character }, end: { line: 0, character } }, newText }] });
const didWriteFiles = (messages: any[]) => messages.filter(message => message.method === "workspace/didWriteFiles").map(message => ({ origin: message.params.origin, files: message.params.files.map((f: any) => [f.uri, f.size]) }));

it("leaves a superseded file out of a workspace edit's notification when the edit's later file was still writing", async () => {
  const h = await gatedWorker();
  await h.send("a", [65], "file://local/a.sd");
  await h.send("b", [66], "file://local/b.sd");
  const before = h.messages.length;
  h.blockCall(2);
  await h.request("edit", "workspace/applyWorkspaceEdit", { edit: { documentChanges: [insertAtEnd("file://local/a.sd", 1, "!"), insertAtEnd("file://local/b.sd", 1, "!")] } }, 250);
  await h.request("autosave", "workspace/willWriteFiles", { files: [{ uri: "file://local/a.sd", version: 3, data: new Uint8Array([65, 33, 67, 68]).buffer }], origin: "editor" });
  expect(h.messages.find(message => message.id === "autosave")).toHaveProperty("result");
  expect(h.messages.find(message => message.id === "edit")).toBeUndefined();
  h.release();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.messages.find(message => message.id === "edit")).toMatchObject({ result: { applied: true } });
  expect(didWriteFiles(h.messages.slice(before))).toEqual([
    { origin: "editor", files: [["file://local/a.sd", 4]] },
    { origin: undefined, files: [["file://local/b.sd", 2]] },
  ]);
});

it("commits a rename onto a file before the editor's autosave that follows it", async () => {
  const h = await gatedWorker();
  await h.send("x", [88], "file://local/x.sd");
  await h.send("main", [65], "file://local/main.sd");
  const before = h.messages.length;
  h.blockCall(1);
  await h.request("inflight", "workspace/willWriteFiles", { files: [{ uri: "file://local/main.sd", version: 2, data: new Uint8Array([65, 1]).buffer }] });
  await h.request("rename", "workspace/willRenameFiles", { files: [{ oldUri: "file://local/x.sd", newUri: "file://local/main.sd" }] }, 0);
  await h.request("autosave", "workspace/willWriteFiles", { files: [{ uri: "file://local/main.sd", version: 3, data: new Uint8Array([65, 66, 67]).buffer }], origin: "editor" }, 0);
  h.release();
  await vi.advanceTimersByTimeAsync(250);
  expect(h.messages.find(message => message.id === "rename")).toMatchObject({ result: [{ size: 1 }] });
  expect(h.messages.find(message => message.id === "autosave")).toMatchObject({ result: [{ size: 3 }] });
  expect(h.bytes()).toEqual(new Uint8Array([65, 66, 67]));
  const writes = didWriteFiles(h.messages.slice(before));
  expect(writes.at(-1)).toEqual({ origin: "editor", files: [["file://local/main.sd", 3]] });
  expect(writes.filter(write => write.origin === "editor")).toHaveLength(1);
});

it("keeps a raster import pending until its thumbnail is cached", async () => {
  let finish!: () => void;
  const h = await worker({ thumbnail: new Promise<void>(resolve => { finish = resolve; }) });
  expect(await h.send("image", [1], "file://local/zz.png")).toBeUndefined();
  expect(h.thumbnails).toHaveLength(0);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.thumbnails).toEqual([expect.stringContaining("local/zz.png?thumb=144")]);
  expect(h.messages.find(message => message.id === "image")).toHaveProperty("result");
});

it("caches the import-time thumbnail under the key the service worker serves", async () => {
  const h = await worker({ thumbnail: Promise.resolve() });
  await h.send("image", [1, 2], "file://local/zz.png");
  expect(h.decode).toHaveBeenCalledTimes(1);
  const stored = await h.file.getFile();
  const served = await getOrCreateThumbnail(
    { match: async key => h.thumbnailCache.get(key), put: async () => { throw new Error("service worker regenerated the thumbnail"); } },
    "local/zz.png",
    Object.assign(new Blob([new Uint8Array(2)]), { lastModified: stored.lastModified }),
    "144",
    "/file:/",
  );
  expect(served).toBeInstanceOf(Response);
  expect(h.decode).toHaveBeenCalledTimes(1);
  expect(h.thumbnailCache.size).toBe(1);
});

it("does not acknowledge deletion while storage is still removing the file", async () => {
  let finish!: () => void;
  const h = await worker({ remove: () => new Promise<void>(resolve => { finish = resolve; }) });
  await h.send("create");
  expect(await h.request("delete", "workspace/willDeleteFiles", { files: [{ uri: "file://local/main.sd" }] })).toBeUndefined();
  expect(h.exists()).toBe(true);
  expect(h.messages.some(message => message.method === "workspace/didDeleteFiles")).toBe(false);
  finish();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.exists()).toBe(false);
  expect(h.messages.find(message => message.id === "delete")).toHaveProperty("result");
});

it("returns an asynchronous deletion failure without broadcasting success", async () => {
  const h = await worker({ remove: async () => { throw new DOMException("locked", "NoModificationAllowedError"); } });
  await h.send("create");
  expect(await h.request("delete", "workspace/willDeleteFiles", { files: [{ uri: "file://local/main.sd" }] })).toMatchObject({ error: { message: "locked" } });
  expect(h.exists()).toBe(true);
  expect(h.messages.some(message => message.method === "workspace/didDeleteFiles")).toBe(false);
});

it("notifies successful deletions when another file in the batch fails", async () => {
  const h = await worker({ remove: async name => { if (name === "b.sd") throw new DOMException("b is locked", "NoModificationAllowedError"); } });
  await h.send("a", [1], "file://local/a.sd");
  await h.send("b", [2], "file://local/b.sd");
  const before = h.messages.length;
  expect(await h.request("mixed", "workspace/willDeleteFiles", { files: [{ uri: "file://local/a.sd" }, { uri: "file://local/b.sd" }] })).toMatchObject({ error: { message: "b is locked" } });
  const notifications = h.messages.slice(before).filter(message => !message.id);
  expect(notifications).toContainEqual(expect.objectContaining({ method: "workspace/didDeleteFiles", params: expect.objectContaining({ files: [{ uri: "file://local/a.sd" }] }) }));
  expect(notifications).toContainEqual(expect.objectContaining({ method: "workspace/didChangeWatchedFiles", params: expect.objectContaining({ changes: [{ uri: "file://local/a.sd", type: 3 }] }) }));
});

it("returns a failed import instead of leaving the request pending, and releases its lock", async () => {
  const h = await worker({ fail: "write" });
  expect(await h.send("quota")).toMatchObject({ error: { message: expect.stringContaining("full") } });
  expect(h.locked()).toBe(false);
  expect(h.removeEntry).not.toHaveBeenCalled();
});

it("removes a new file after a failed import without removing existing files", async () => {
  const h = await worker({ existing: false, fail: "write" });
  expect(await h.send("new")).toHaveProperty("error");
  expect(h.exists()).toBe(false);
  expect(h.locked()).toBe(false);
});

it("returns storage lookup failures through the same protocol", async () => {
  const h = await worker({ fail: "root" });
  expect(await h.send("root")).toMatchObject({ error: { message: expect.stringContaining("denied") } });
  expect(h.removeEntry).not.toHaveBeenCalled();
});

it("does not mistake a failed existence lookup for a new file", async () => {
  const h = await worker({ fail: "lookup" });
  expect(await h.send("lookup")).toHaveProperty("error");
  expect(h.exists()).toBe(true);
  expect(h.removeEntry).not.toHaveBeenCalled();
});

it("reports short writes and cleans up new partial files", async () => {
  const h = await worker({ existing: false, fail: "short" });
  expect(await h.send("short")).toMatchObject({ error: { message: "Wrote 2 of 3 bytes" } });
  expect(h.exists()).toBe(false);
  expect(h.locked()).toBe(false);
});

it("keeps a later queued write pending until its own bytes have landed", async () => {
  let resume!: () => void;
  let first = true;
  const h = await worker({ acquire: async () => {
    if (first) { first = false; await new Promise<void>(resolve => { resume = resolve; }); }
  } });
  expect(await h.send("first", [1])).toBeUndefined();
  expect(await h.send("second", [2, 3])).toBeUndefined();
  expect(h.bytes()).toEqual(new Uint8Array([9]));
  resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.messages.find(message => message.id === "first")).toMatchObject({ result: [{ size: 1 }] });
  expect(h.messages.find(message => message.id === "second")).toMatchObject({ result: [{ size: 2 }] });
  expect(h.bytes()).toEqual(new Uint8Array([2, 3]));
});
