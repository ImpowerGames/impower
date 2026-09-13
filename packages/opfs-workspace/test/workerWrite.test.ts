import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function worker({ existing = true, fail = "", acquire = async () => {} } = {}) {
  vi.resetModules();
  vi.useFakeTimers();
  const messages: any[] = [];
  let bytes = new Uint8Array([9]);
  let exists = existing;
  let locked = false;
  const close = vi.fn(() => { locked = false; });
  const removeEntry = vi.fn(async () => { exists = false; });
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
  const send = async (id: string, data = [1, 2, 3]) => {
    void (globalThis as any).onmessage({ data: { jsonrpc: "2.0", id, method: "workspace/willCreateFiles", params: { files: [{ uri: "file://local/main.sd", data: new Uint8Array(data).buffer }] } } });
    await vi.advanceTimersByTimeAsync(101);
    return messages.find(message => message.id === id && ("result" in message || "error" in message));
  };
  return { send, messages, close, removeEntry, exists: () => exists, locked: () => locked, bytes: () => bytes };
}

it("answers successful imports on the real worker message handler", async () => {
  const h = await worker();
  expect(await h.send("ok")).toMatchObject({ result: [{ uri: "file://local/main.sd" }] });
  expect(h.bytes()).toEqual(new Uint8Array([1, 2, 3]));
  expect(h.close).toHaveBeenCalledTimes(1);
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
