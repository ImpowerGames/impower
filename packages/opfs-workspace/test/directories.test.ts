import { afterEach, expect, it, vi } from "vitest";
import {
  listMemory,
  makeMemoryDirectory,
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
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => root } });
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
  const directories = (params: any) => request("workspace/directories", params);
  const changes = () =>
    messages
      .filter((m) => m.method === "workspace/didChangeDirectories")
      .map(({ params: { commits: _commits, ...params } }) => params);
  const commits = () =>
    messages
      .filter((m) => m.method === "workspace/didChangeDirectories")
      .map((m) => m.params.commits);
  return { root, request, directories, changes, commits };
}

it("creates a directory with its ancestors and lists it with no file in it", async () => {
  const h = await worker();
  expect(
    await h.directories({ action: "create", uris: ["file://p/assets/empty/inner"] }),
  ).toMatchObject({ result: { uris: ["file://p/assets/empty/inner"] } });
  expect(listMemory(h.root, "p")).toEqual(["assets/", "assets/empty/", "assets/empty/inner/"]);
  expect(h.changes()).toEqual([
    { created: ["file://p/assets/empty/inner"], deleted: [] },
  ]);
  expect(h.commits()).toEqual([
    {
      "file://p/assets/empty/inner": {
        sequence: expect.any(Number),
        writer: expect.any(String),
      },
    },
  ]);
  expect(
    await h.directories({ action: "list", directory: { uri: "file://p" } }),
  ).toMatchObject({
    result: { uris: ["file://p/assets", "file://p/assets/empty", "file://p/assets/empty/inner"] },
  });
});

it("lists directories without the trash", async () => {
  const h = await worker();
  makeMemoryDirectory(h.root, "p/.trash/123__x/assets");
  makeMemoryDirectory(h.root, "p/scripts/chapters");
  expect(
    (await h.directories({ action: "list", directory: { uri: "file://p" } })).result.uris,
  ).toEqual(["file://p/scripts", "file://p/scripts/chapters"]);
});

it("deletes a directory and its empty subdirectories, and leaves one that holds a file", async () => {
  const h = await worker();
  makeMemoryDirectory(h.root, "p/assets/empty/inner");
  writeMemoryFile(h.root, "p/assets/full/x.png", new Uint8Array([1]));
  makeMemoryDirectory(h.root, "p/assets/full/hollow");
  const result = await h.directories({
    action: "delete",
    uris: ["file://p/assets/empty", "file://p/assets/full", "file://p/missing"],
  });
  expect([...result.result.uris].sort()).toEqual([
    "file://p/assets/empty",
    "file://p/assets/empty/inner",
    "file://p/assets/full/hollow",
  ]);
  expect(listMemory(h.root, "p")).toEqual(["assets/", "assets/full/", "assets/full/x.png"]);
  expect(h.changes()).toEqual([{ created: [], deleted: result.result.uris }]);
});

it("deletes nothing and sends no notification when every directory holds a file", async () => {
  const h = await worker();
  writeMemoryFile(h.root, "p/assets/x.png", new Uint8Array([1]));
  expect(
    await h.directories({ action: "delete", uris: ["file://p/assets"] }),
  ).toMatchObject({ result: { uris: [] } });
  expect(h.changes()).toEqual([]);
});

it("writes a file named .folder like any other file", async () => {
  const h = await worker();
  const created = await h.request("workspace/willCreateFiles", {
    files: [{ uri: "file://p/assets/.folder", data: new Uint8Array([7]).buffer }],
  });
  expect(created.result).toMatchObject([{ uri: "file://p/assets/.folder" }]);
  const listed = await h.request("workspace/readDirectoryFiles", {
    directory: { uri: "file://p" },
  });
  expect(listed.result.map((f: any) => f.uri)).toEqual(["file://p/assets/.folder"]);
});

it("zips directories as entries ending in a slash and unzips them back", async () => {
  const h = await worker();
  writeMemoryFile(h.root, "p/main.sd", new TextEncoder().encode("x"));
  const zipped = await h.request("workspace/zipFiles", {
    files: [{ uri: "file://p/main.sd", path: "main.sd" }],
    directories: ["assets/empty"],
  });
  const unzipped = await h.request("workspace/unzipFiles", { data: zipped.result });
  expect(unzipped.result.map((e: any) => e.filename).sort()).toEqual([
    "assets/empty/",
    "main.sd",
  ]);
});
