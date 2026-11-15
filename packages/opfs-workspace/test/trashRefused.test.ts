import { afterEach, expect, it, vi } from "vitest";
import { listMemory, memoryLocks, memoryRoot, writeMemoryFile } from "./memoryOpfs";

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

it("answers with the moved files when storage refuses none", async () => {
  const h = await worker();
  seed(h.root);
  const response = await trashDelete(h);
  expect(response.error).toBeUndefined();
  expect(response.result.map((f: any) => f.uri)).toEqual(["file://p/Scripts/a.sd", "file://p/Scripts/b.sd"]);
});
