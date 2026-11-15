import { afterEach, expect, it, vi } from "vitest";
import { listMemory, memoryLocks, memoryRoot, MemoryDirectory, MemoryFile, writeMemoryFile } from "./memoryOpfs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function worker() {
  vi.resetModules();
  const root = memoryRoot();
  const messages: any[] = [];
  vi.stubGlobal("navigator", {
    storage: { getDirectory: async () => root },
    locks: memoryLocks(),
  });
  vi.stubGlobal("BroadcastChannel", class { onmessage = null; postMessage() {} close() {} });
  vi.stubGlobal("postMessage", (message: any) => messages.push(message));
  vi.stubGlobal("onmessage", null);
  vi.stubGlobal("self", globalThis);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../src/opfs-workspace");
  let id = 0;
  const request = async (method: string, params: any) => {
    const requestId = `r${id++}`;
    await (globalThis as any).onmessage({ data: { jsonrpc: "2.0", id: requestId, method, params } });
    return messages.find((m) => m.id === requestId);
  };
  await (globalThis as any).onmessage({
    data: { jsonrpc: "2.0", method: "workspace/didChangeConfiguration", params: { settings: { scriptFiles: "*.sd" } } },
  });
  const deletes = () =>
    messages
      .filter((m) => m.method === "workspace/didDeleteFiles")
      .flatMap((m) => m.params.files.map((f: any) => f.uri));
  return { root, request, deletes };
}

const refuseRemoving = (root: any, refused: string[]) => {
  const scripts = root.entries.get("p").entries.get("Scripts");
  const realRemove = scripts.removeEntry.bind(scripts);
  scripts.removeEntry = async (name: string, options?: any) => {
    if (refused.includes(name)) throw new DOMException("refused", "NoModificationAllowedError");
    return realRemove(name, options);
  };
};

const seed = (root: any) => {
  writeMemoryFile(root, "p/Scripts/a.sd", new TextEncoder().encode("A"));
  writeMemoryFile(root, "p/Scripts/b.sd", new TextEncoder().encode("B"));
};

const trashDelete = (h: Awaited<ReturnType<typeof worker>>) =>
  h.request("workspace/willDeleteFiles", {
    files: [{ uri: "file://p/Scripts/a.sd" }, { uri: "file://p/Scripts/b.sd" }],
    folders: [],
    mode: "trash",
  });

it("names the file storage refused to move and leaves no copy of it in the bin", async () => {
  const h = await worker();
  seed(h.root);
  refuseRemoving(h.root, ["a.sd"]);
  const response = await trashDelete(h);
  expect(response.result).toBeUndefined();
  expect(response.error.data.skipped).toEqual(["file://p/Scripts/a.sd"]);
  expect(response.error.data.files.map((f: any) => f.uri)).toEqual(["file://p/Scripts/b.sd"]);
  expect(response.error.message).toContain("file://p/Scripts/a.sd");
  expect(h.deletes()).toEqual(["file://p/Scripts/b.sd"]);
  const tree = listMemory(h.root, "p");
  expect(tree).toContain("Scripts/a.sd");
  expect(tree).not.toContain("Scripts/b.sd");
  expect(tree.filter((p) => p.startsWith(".trash/") && p.endsWith(".sd"))).toEqual([
    expect.stringMatching(/^\.trash\/[^/]+\/Scripts\/b\.sd$/),
  ]);
  const batches = (await h.request("workspace/trashFiles", { projectId: "p", action: "list" })).result.batches;
  expect(batches).toHaveLength(1);
  expect(batches[0].entries.map((e: any) => e.relPath)).toEqual(["Scripts/b.sd"]);
});

it("leaves no empty batch in the bin when storage refuses every file", async () => {
  const h = await worker();
  seed(h.root);
  refuseRemoving(h.root, ["a.sd", "b.sd"]);
  const response = await trashDelete(h);
  expect(response.error.data).toEqual({
    files: [],
    skipped: ["file://p/Scripts/a.sd", "file://p/Scripts/b.sd"],
  });
  expect(h.deletes()).toEqual([]);
  expect(listMemory(h.root, "p").filter((p) => p.startsWith(".trash/") && p !== ".trash/")).toEqual([]);
  expect((await h.request("workspace/trashFiles", { projectId: "p", action: "list" })).result.batches).toEqual([]);
});

const refuseCopyRemoval = (root: any, times: number) => {
  const scripts = root.entries.get("p").entries.get("Scripts");
  const realRemove = MemoryDirectory.prototype.removeEntry;
  let refusals = 0;
  vi.spyOn(MemoryDirectory.prototype, "removeEntry").mockImplementation(async function (this: any, name, options) {
    if (this !== scripts && name === "a.sd" && refusals < times) {
      refusals++;
      throw new DOMException("refused", "NoModificationAllowedError");
    }
    return realRemove.call(this, name, options);
  });
};

it("removes the refused file's copy from the bin when the first removal of the copy is refused too", async () => {
  const h = await worker();
  seed(h.root);
  refuseRemoving(h.root, ["a.sd"]);
  refuseCopyRemoval(h.root, 1);
  const response = await trashDelete(h);
  expect(response.error.data.skipped).toEqual(["file://p/Scripts/a.sd"]);
  const tree = listMemory(h.root, "p");
  expect(tree.filter((p) => p.startsWith(".trash/") && p.endsWith(".sd"))).toEqual([
    expect.stringMatching(/^\.trash\/[^/]+\/Scripts\/b\.sd$/),
  ]);
});

it("lists the refused file's copy in the bin when its copy cannot be removed at all", async () => {
  const h = await worker();
  seed(h.root);
  refuseRemoving(h.root, ["a.sd"]);
  refuseCopyRemoval(h.root, Infinity);
  const response = await trashDelete(h);
  expect(response.error.data.skipped).toEqual(["file://p/Scripts/a.sd"]);
  expect(listMemory(h.root, "p")).toContain("Scripts/a.sd");
  const copies = listMemory(h.root, "p").filter((p) => p.startsWith(".trash/") && p.endsWith(".sd"));
  const batches = (await h.request("workspace/trashFiles", { projectId: "p", action: "list" })).result.batches;
  expect(batches).toHaveLength(1);
  expect(copies.map((p) => p.slice(`.trash/${batches[0].batchId}/`.length)).sort()).toEqual(
    batches[0].entries.map((e: any) => e.relPath).sort(),
  );
  expect(batches[0].entries.map((e: any) => e.relPath).sort()).toEqual(["Scripts/a.sd", "Scripts/b.sd"]);
});

it("removes a part-written copy of the refused file from the bin when its first removal is refused too", async () => {
  const h = await worker();
  seed(h.root);
  const scripts = h.root.entries.get("p")!.entries.get("Scripts") as MemoryDirectory;
  const realAccess = MemoryFile.prototype.createSyncAccessHandle;
  vi.spyOn(MemoryFile.prototype, "createSyncAccessHandle").mockImplementation(async function (this: MemoryFile) {
    const handle = await realAccess.call(this);
    if (this.name !== "a.sd" || scripts.entries.get("a.sd") === this) return handle;
    const write = handle.write;
    return { ...handle, write: (data: DataView | Uint8Array) => write(new Uint8Array(data.buffer, data.byteOffset, 0)) };
  });
  refuseRemoving(h.root, ["a.sd"]);
  refuseCopyRemoval(h.root, 1);
  const response = await trashDelete(h);
  expect(response.error.data.skipped).toEqual(["file://p/Scripts/a.sd"]);
  expect(listMemory(h.root, "p").filter((p) => p.startsWith(".trash/") && p.endsWith(".sd"))).toEqual([
    expect.stringMatching(/^\.trash\/[^/]+\/Scripts\/b\.sd$/),
  ]);
});

it("names the batch it kept in the bin when some files moved", async () => {
  const h = await worker();
  seed(h.root);
  refuseRemoving(h.root, ["a.sd"]);
  const response = await trashDelete(h);
  const batches = (await h.request("workspace/trashFiles", { projectId: "p", action: "list" })).result.batches;
  expect(response.error.data.batchId).toBe(batches[0].batchId);
});

it("does not name a file that is already gone as one still in place", async () => {
  const h = await worker();
  writeMemoryFile(h.root, "p/Scripts/b.sd", new TextEncoder().encode("B"));
  const response = await trashDelete(h);
  expect(response.error).toBeUndefined();
  expect(response.result.map((f: any) => f.uri)).toEqual(["file://p/Scripts/b.sd"]);
  expect(listMemory(h.root, "p")).not.toContain("Scripts/b.sd");
});

it("leaves no empty batch in the bin when every file is already gone", async () => {
  const h = await worker();
  writeMemoryFile(h.root, "p/Scripts/c.sd", new TextEncoder().encode("C"));
  const response = await trashDelete(h);
  expect(response.error).toBeUndefined();
  expect(response.result).toEqual([]);
  expect((await h.request("workspace/trashFiles", { projectId: "p", action: "list" })).result.batches).toEqual([]);
});

it("answers with the moved files when storage refuses none", async () => {
  const h = await worker();
  seed(h.root);
  const response = await trashDelete(h);
  expect(response.error).toBeUndefined();
  expect(response.result.map((f: any) => f.uri)).toEqual(["file://p/Scripts/a.sd", "file://p/Scripts/b.sd"]);
});
