import { afterEach, expect, it, vi } from "vitest";
import {
  listMemory,
  makeMemoryDirectory,
  memoryLocks,
  memoryRoot,
  writeMemoryFile,
} from "./memoryOpfs";

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
  const trash = (params: any) => request("workspace/trashFiles", { projectId: "p", ...params });
  const created = () =>
    messages
      .filter((m) => m.method === "workspace/didChangeDirectories")
      .flatMap((m) => m.params.created);
  return { root, request, trash, created };
}

it("keeps a deleted empty folder in the bin and gives it back on Restore", async () => {
  const h = await worker();
  makeMemoryDirectory(h.root, "p/Scripts/Empty/Inner");
  await h.request("workspace/willDeleteFiles", {
    files: [],
    folders: [{ uri: "file://p/Scripts/Empty" }, { uri: "file://p/Scripts/Empty/Inner" }],
    mode: "trash",
  });
  await h.request("workspace/directories", { action: "delete", uris: ["file://p/Scripts/Empty"] });
  expect(listMemory(h.root, "p").filter((p) => !p.startsWith(".trash"))).toEqual(["Scripts/"]);
  const batches = (await h.trash({ action: "list" })).result.batches;
  expect(batches).toHaveLength(1);
  expect(batches[0]).toMatchObject({ entries: [], folders: ["Scripts/Empty", "Scripts/Empty/Inner"] });
  await h.trash({ action: "restore", batchId: batches[0].batchId });
  expect(listMemory(h.root, "p").filter((p) => !p.startsWith(".trash"))).toEqual([
    "Scripts/",
    "Scripts/Empty/",
    "Scripts/Empty/Inner/",
  ]);
  expect(h.created()).toEqual(["file://p/Scripts/Empty/Inner"]);
  expect((await h.trash({ action: "list" })).result.batches).toEqual([]);
});

it("restores a deleted folder's empty subfolders along with its files", async () => {
  const h = await worker();
  writeMemoryFile(h.root, "p/Scripts/Drafts/old.sd", new TextEncoder().encode("Old"));
  makeMemoryDirectory(h.root, "p/Scripts/Drafts/Empty");
  await h.request("workspace/willDeleteFiles", {
    files: [{ uri: "file://p/Scripts/Drafts/old.sd" }],
    folders: [{ uri: "file://p/Scripts/Drafts" }, { uri: "file://p/Scripts/Drafts/Empty" }],
    mode: "trash",
  });
  await h.request("workspace/directories", { action: "delete", uris: ["file://p/Scripts/Drafts"] });
  const [batch] = (await h.trash({ action: "list" })).result.batches;
  expect(batch).toMatchObject({
    entries: [{ relPath: "Scripts/Drafts/old.sd" }],
    folders: ["Scripts/Drafts", "Scripts/Drafts/Empty"],
  });
  await h.trash({ action: "restore", batchId: batch.batchId });
  expect(listMemory(h.root, "p").filter((p) => !p.startsWith(".trash"))).toEqual([
    "Scripts/",
    "Scripts/Drafts/",
    "Scripts/Drafts/Empty/",
    "Scripts/Drafts/old.sd",
  ]);
});

it("restores a folder whose name a file now holds under a restored name, with everything inside it", async () => {
  const h = await worker();
  writeMemoryFile(h.root, "p/Scripts/Drafts.sd/old.sd", new TextEncoder().encode("Old"));
  makeMemoryDirectory(h.root, "p/Scripts/Drafts.sd/Empty");
  await h.request("workspace/willDeleteFiles", {
    files: [{ uri: "file://p/Scripts/Drafts.sd/old.sd" }],
    folders: [{ uri: "file://p/Scripts/Drafts.sd" }, { uri: "file://p/Scripts/Drafts.sd/Empty" }],
    mode: "trash",
  });
  await h.request("workspace/directories", { action: "delete", uris: ["file://p/Scripts/Drafts.sd"] });
  writeMemoryFile(h.root, "p/Scripts/Drafts.sd", new TextEncoder().encode("Live"));
  const [batch] = (await h.trash({ action: "list" })).result.batches;
  const response = await h.trash({ action: "restore", batchId: batch.batchId });
  expect(response.error).toBeUndefined();
  expect(response.result.restoredFolders).toEqual([
    "Scripts/Drafts.sd (restored)",
    "Scripts/Drafts.sd (restored)/Empty",
  ]);
  expect(response.result.restored.map((f: { uri: string }) => f.uri)).toEqual([
    "file://p/Scripts/Drafts.sd (restored)/old.sd",
  ]);
  expect(listMemory(h.root, "p").filter((p) => !p.startsWith(".trash"))).toEqual([
    "Scripts/",
    "Scripts/Drafts.sd",
    "Scripts/Drafts.sd (restored)/",
    "Scripts/Drafts.sd (restored)/Empty/",
    "Scripts/Drafts.sd (restored)/old.sd",
  ]);
});

it("records no folders for a deletion of files alone", async () => {
  const h = await worker();
  writeMemoryFile(h.root, "p/a.sd", new TextEncoder().encode("A"));
  await h.request("workspace/willDeleteFiles", { files: [{ uri: "file://p/a.sd" }], mode: "trash" });
  const [batch] = (await h.trash({ action: "list" })).result.batches;
  expect(batch.folders).toBeUndefined();
  expect(batch.entries).toHaveLength(1);
});
