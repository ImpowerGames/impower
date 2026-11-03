import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function worker() {
  vi.resetModules();
  vi.useFakeTimers();
  const disk = new Map<string, Uint8Array>();
  const messages: any[] = [];
  let channel: any;
  let blockedName = "";
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const directory: any = {
    getDirectoryHandle: async () => directory,
    getFileHandle: async (name: string, options: { create?: boolean } = {}) => {
      if (!disk.has(name)) {
        if (!options.create) throw new DOMException("missing", "NotFoundError");
        disk.set(name, new Uint8Array());
      }
      return {
        createSyncAccessHandle: async () => {
          if (name === blockedName) await gate;
          return {
            truncate: () => disk.set(name, new Uint8Array()),
            write: (data: DataView | Uint8Array) => {
              disk.set(name, new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
              return data.byteLength;
            },
            flush() {},
            close() {},
          };
        },
        getFile: async () => {
          const bytes = disk.get(name)!.slice();
          return { size: bytes.length, lastModified: 1, arrayBuffer: async () => bytes.buffer };
        },
      };
    },
    removeEntry: async (name: string) => { disk.delete(name); },
  };
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => directory } });
  vi.stubGlobal("BroadcastChannel", class {
    onmessage: any = null;
    constructor() { channel = this; }
    postMessage() {}
    close() {}
  });
  vi.stubGlobal("postMessage", (message: any) => { messages.push(structuredClone(message)); });
  vi.stubGlobal("onmessage", null);
  vi.stubGlobal("self", globalThis);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../src/opfs-workspace");
  const dispatch = (id: string | undefined, method: string, params: any) => {
    void (globalThis as any).onmessage({ data: { jsonrpc: "2.0", id, method, params } });
  };
  const request = async (id: string, method: string, params: any, elapsed = 101) => {
    dispatch(id, method, params);
    await vi.advanceTimersByTimeAsync(elapsed);
    return messages.find(message => message.id === id);
  };
  dispatch(undefined, "workspace/didChangeConfiguration", { settings: { scriptFiles: "*.sd" } });
  const create = (name: string, text: string) => request(name, "workspace/willCreateFiles", {
    files: [{ uri: `file://local/${name}`, data: new TextEncoder().encode(text).buffer }],
  });
  const text = (name: string) => new TextDecoder().decode(disk.get(name));
  const fromOtherTab = (method: string, params: any) => channel.onmessage({ data: { jsonrpc: "2.0", method, params: { ...params, remote: true } } });
  const remoteFile = (name: string, contents: string, modified?: number) => ({
    uri: `file://local/${name}`, name: name.replace(/[.]sd$/, ""), ext: "sd", type: "script", src: `/file:/local/${name}`,
    version: 9, size: contents.length, modified, languageId: "sparkdown", text: contents,
  });
  return {
    messages, request, create, text, fromOtherTab, remoteFile, release,
    disk,
    block: (name: string) => { blockedName = name; },
  };
}

const insertAfterFirst = (name: string, newText: string) => ({
  textDocument: { uri: `file://local/${name}`, version: null },
  edits: [{ range: { start: { line: 0, character: 1 }, end: { line: 0, character: 1 } }, newText }],
});
const localWrites = (messages: any[]) => messages
  .filter(message => message.method === "workspace/didWriteFiles" && !message.params.remote)
  .map(message => ({ origin: message.params.origin, files: message.params.files.map((f: any) => [f.uri, f.text]) }));

it("reports another tab's newer commit, not this tab's earlier write, when a delayed workspace edit finishes", async () => {
  const h = await worker();
  await h.create("a.sd", "A");
  await h.create("b.sd", "B");
  h.block("b.sd");
  await h.request("edit", "workspace/applyWorkspaceEdit", { edit: { documentChanges: [insertAfterFirst("a.sd", "!"), insertAfterFirst("b.sd", "!")] } }, 250);
  expect(h.text("a.sd")).toBe("A!");
  h.disk.set("a.sd", new TextEncoder().encode("REMOTE"));
  h.fromOtherTab("workspace/didWriteFiles", { files: [h.remoteFile("a.sd", "REMOTE")], origin: "LogicScriptEditor:1" });
  const before = h.messages.length;
  h.release();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.messages.find(message => message.id === "edit")).toMatchObject({ result: { applied: true } });
  expect(localWrites(h.messages.slice(before))).toEqual([
    { origin: undefined, files: [["file://local/a.sd", "REMOTE"], ["file://local/b.sd", "B!"]] },
  ]);
});

it("leaves a file another tab deleted out of a delayed workspace edit's notification", async () => {
  const h = await worker();
  await h.create("a.sd", "A");
  await h.create("b.sd", "B");
  h.block("b.sd");
  await h.request("edit", "workspace/applyWorkspaceEdit", { edit: { documentChanges: [insertAfterFirst("a.sd", "!"), insertAfterFirst("b.sd", "!")] } }, 250);
  h.disk.delete("a.sd");
  h.fromOtherTab("workspace/didDeleteFiles", { files: [{ uri: "file://local/a.sd" }] });
  const before = h.messages.length;
  h.release();
  await vi.advanceTimersByTimeAsync(0);
  expect(localWrites(h.messages.slice(before))).toEqual([
    { origin: undefined, files: [["file://local/b.sd", "B!"]] },
  ]);
});

it("edits another tab's committed text rather than this tab's stale copy", async () => {
  const h = await worker();
  await h.create("a.sd", "A");
  h.disk.set("a.sd", new TextEncoder().encode("RA"));
  h.fromOtherTab("workspace/didWriteFiles", { files: [h.remoteFile("a.sd", "RA", Date.now() + 1)] });
  await h.request("edit", "workspace/applyWorkspaceEdit", { edit: { documentChanges: [insertAfterFirst("a.sd", "!")] } }, 250);
  expect(h.text("a.sd")).toBe("R!A");
});

it("keeps this tab's newer commit when another tab's older write arrives late", async () => {
  const h = await worker();
  await h.create("a.sd", "A");
  h.fromOtherTab("workspace/didWriteFiles", { files: [h.remoteFile("a.sd", "OLD", 1)] });
  await h.request("edit", "workspace/applyWorkspaceEdit", { edit: { documentChanges: [insertAfterFirst("a.sd", "!")] } }, 250);
  expect(h.text("a.sd")).toBe("A!");
});
