import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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
  if (thumbnailGate) {
    vi.stubGlobal("createImageBitmap", async () => { await thumbnailGate; return { width: 2, height: 2, close() {} }; });
    vi.stubGlobal("OffscreenCanvas", class {
      getContext() { return { drawImage() {} }; }
      async convertToBlob() { return new Blob(["thumbnail"], { type: "image/webp" }); }
    });
    vi.stubGlobal("caches", { open: async () => ({ put: async (key: string) => { thumbnails.push(key); } }) });
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
  const directory: any = {
    getDirectoryHandle: async () => directory,
    getFileHandle: async (_name: string, options: { create?: boolean } = {}) => {
      if (fail === "lookup") throw new DOMException("locked lookup", "NotAllowedError");
      if (!exists && !options.create) throw new DOMException("missing", "NotFoundError");
      exists = true;
      return file;
    },
    removeEntry,
  };
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => {
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
  return { send, request, messages, close, removeEntry, thumbnails, exists: () => exists, locked: () => locked, bytes: () => bytes };
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
  expect(notifications).toContainEqual(expect.objectContaining({ method: "workspace/didDeleteFiles", params: { files: [{ uri: "file://local/a.sd" }] } }));
  expect(notifications).toContainEqual(expect.objectContaining({ method: "workspace/didChangeWatchedFiles", params: { changes: [{ uri: "file://local/a.sd", type: 3 }] } }));
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
  resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.messages.find(message => message.id === "first")).toHaveProperty("result");
  expect(h.messages.find(message => message.id === "second")).toBeUndefined();
  expect(h.bytes()).toEqual(new Uint8Array([1]));
  await vi.advanceTimersByTimeAsync(101);
  expect(h.messages.find(message => message.id === "second")).toHaveProperty("result");
  expect(h.bytes()).toEqual(new Uint8Array([2, 3]));
});
