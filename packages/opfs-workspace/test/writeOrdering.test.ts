import { afterEach, describe, expect, it, vi } from "vitest";
import { allocateCommit } from "../src/utils/commitSequence";
import {
  MemoryDirectory,
  MemoryFile,
  listMemory,
  makeMemoryDirectory,
  memoryRoot,
  writeMemoryFile,
  memoryLocks,
} from "./memoryOpfs";

const enc = new TextEncoder();
const dec = new TextDecoder();
const uriOf = (path: string) => `file://local/${path}`;

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const seed = (files: Record<string, string | number[]>, folders: string[] = []) => {
  const root = memoryRoot();
  for (const [path, content] of Object.entries(files)) {
    writeMemoryFile(
      root,
      `local/${path}`,
      typeof content === "string" ? enc.encode(content) : new Uint8Array(content),
    );
  }
  for (const folder of folders) {
    makeMemoryDirectory(root, `local/${folder}`);
  }
  return root;
};

const entryAt = (root: MemoryDirectory, path: string) =>
  `local/${path}`
    .split("/")
    .reduce<MemoryDirectory | MemoryFile | undefined>(
      (dir, name) =>
        dir instanceof MemoryDirectory ? dir.entries.get(name) : undefined,
      root,
    );

const fileAt = (root: MemoryDirectory, path: string) => {
  const entry = entryAt(root, path);
  return entry instanceof MemoryFile ? entry : undefined;
};

const textAt = (root: MemoryDirectory, path: string) => {
  const file = fileAt(root, path);
  return file ? dec.decode(file.bytes) : undefined;
};

const fileData = (path: string, text: string) => ({
  uri: uriOf(path),
  name: path.replace(/[.][^.]*$/, ""),
  ext: path.split(".").pop(),
  type: "script",
  src: `/file:/local/${path}`,
  version: 1,
  size: enc.encode(text).byteLength,
  modified: 1,
  languageId: "sparkdown",
  text,
});

const otherTab = (root: MemoryDirectory) => {
  let clock = 0;
  const commit = async () => {
    const stamp = await allocateCommit(
      root as unknown as FileSystemDirectoryHandle,
      "other-tab",
      clock,
    );
    clock = stamp.sequence;
    return stamp;
  };
  return {
    commit,
    async write(path: string, text: string) {
      writeMemoryFile(root, `local/${path}`, enc.encode(text));
      return commit();
    },
    async remove(path: string) {
      const parts = `local/${path}`.split("/");
      const parent = parts
        .slice(0, -1)
        .reduce<MemoryDirectory>(
          (dir, name) => dir.entries.get(name) as MemoryDirectory,
          root,
        );
      await parent.removeEntry(parts[parts.length - 1]!);
      return commit();
    },
  };
};

async function worker(root: MemoryDirectory) {
  vi.resetModules();
  vi.useFakeTimers();
  const messages: any[] = [];
  let channel: { onmessage: ((event: { data: unknown }) => void) | null } | undefined;
  vi.stubGlobal("navigator", {
    storage: { getDirectory: async () => root },
    locks: memoryLocks(),
  });
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage = null;
      constructor() {
        channel = this;
      }
      postMessage() {}
      close() {}
    },
  );
  vi.stubGlobal("postMessage", (message: any) => messages.push(message));
  vi.stubGlobal("onmessage", null);
  vi.stubGlobal("self", globalThis);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../src/opfs-workspace");
  void (globalThis as any).onmessage({
    data: {
      jsonrpc: "2.0",
      method: "workspace/didChangeConfiguration",
      params: { settings: { scriptFiles: "*.sd" } },
    },
  });
  const start = (id: string, method: string, params: unknown) =>
    void (globalThis as any).onmessage({ data: { jsonrpc: "2.0", id, method, params } });
  const response = (id: string) =>
    messages.find((m) => m.id === id && ("result" in m || "error" in m));
  const request = async (id: string, method: string, params: unknown, elapsed = 250) => {
    start(id, method, params);
    await vi.advanceTimersByTimeAsync(elapsed);
    return response(id);
  };
  const remote = async (method: string, params: Record<string, unknown>) => {
    channel!.onmessage!({ data: { jsonrpc: "2.0", method, params: { ...params, remote: true } } });
    await vi.advanceTimersByTimeAsync(0);
  };
  const enumerate = () =>
    request("enumerate-" + messages.length, "workspace/readDirectoryFiles", {
      directory: { uri: "file://local" },
    });
  const cached = async (path: string) => {
    const listed = await enumerate();
    return listed.result.find((f: any) => f.uri === uriOf(path));
  };
  const notifications = (method: string, from = 0) =>
    messages.slice(from).filter((m) => m.method === method);
  const writtenTexts = (path: string, from = 0) =>
    notifications("workspace/didWriteFiles", from).flatMap((m) =>
      m.params.files.filter((f: any) => f.uri === uriOf(path)).map((f: any) => f.text),
    );
  return { messages, start, response, request, remote, enumerate, cached, notifications, writtenTexts };
}

const writeOf = (path: string, text: string, origin?: string) => ({
  files: [{ uri: uriOf(path), version: 2, data: enc.encode(text).buffer }],
  origin,
});

const insert = (path: string, character: number, newText: string) => ({
  textDocument: { uri: uriOf(path), version: null },
  edits: [
    {
      range: {
        start: { line: 0, character },
        end: { line: 0, character },
      },
      newText,
    },
  ],
});

describe("writes from different writers inside the write debounce (I-1892)", () => {
  it("commits an outside write and then the editor's autosave in arrival order, each caller resolving with its own file", async () => {
    const root = seed({ "main.sd": "A" });
    const h = await worker(root);
    h.start("outside", "workspace/willWriteFiles", writeOf("main.sd", "OUTSIDE"));
    await vi.advanceTimersByTimeAsync(40);
    await h.request("autosave", "workspace/willWriteFiles", writeOf("main.sd", "EDITOR", "editor"));
    expect(fileAt(root, "main.sd")!.history.map((b) => dec.decode(b))).toEqual(["OUTSIDE", "EDITOR"]);
    expect(h.response("outside").result[0].text).toBe("OUTSIDE");
    expect(h.response("autosave").result[0].text).toBe("EDITOR");
  });

  it("commits the editor's autosave and then an outside write in arrival order, and notifies the outside change", async () => {
    const root = seed({ "main.sd": "A" });
    const h = await worker(root);
    h.start("autosave", "workspace/willWriteFiles", writeOf("main.sd", "EDITOR", "editor"));
    await vi.advanceTimersByTimeAsync(40);
    await h.request("outside", "workspace/willWriteFiles", writeOf("main.sd", "OUTSIDE"));
    expect(fileAt(root, "main.sd")!.history.map((b) => dec.decode(b))).toEqual(["EDITOR", "OUTSIDE"]);
    expect(h.response("autosave").result[0].text).toBe("EDITOR");
    expect(h.response("outside").result[0].text).toBe("OUTSIDE");
    const last = h.notifications("workspace/didWriteFiles").at(-1);
    expect(last.params).toMatchObject({ origin: undefined, files: [{ text: "OUTSIDE" }] });
  });

  it("still merges a burst of autosaves from one writer into one disk write", async () => {
    const root = seed({ "main.sd": "A" });
    const h = await worker(root);
    h.start("first", "workspace/willWriteFiles", writeOf("main.sd", "E1", "editor"));
    await vi.advanceTimersByTimeAsync(40);
    await h.request("second", "workspace/willWriteFiles", writeOf("main.sd", "E2", "editor"));
    expect(fileAt(root, "main.sd")!.history.map((b) => dec.decode(b))).toEqual(["E2"]);
    expect(h.response("first")).toHaveProperty("result");
  });

  it("builds a second workspace edit inside the debounce on the first one's text", async () => {
    const root = seed({ "main.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    h.start("one", "workspace/applyWorkspaceEdit", { edit: { documentChanges: [insert("main.sd", 1, "1")] } });
    await vi.advanceTimersByTimeAsync(10);
    await h.request("two", "workspace/applyWorkspaceEdit", { edit: { documentChanges: [insert("main.sd", 2, "2")] } });
    expect(textAt(root, "main.sd")).toBe("A12");
  });
});

describe("notifications from another tab (I-1893)", () => {
  const delayedBatch = async (root: MemoryDirectory) => {
    const h = await worker(root);
    await h.enumerate();
    let release!: () => void;
    fileAt(root, "b.sd")!.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const before = h.messages.length;
    await h.request("batch", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("a.sd", 1, "!"), insert("b.sd", 1, "!")] },
    });
    expect(textAt(root, "a.sd")).toBe("A!");
    expect(h.response("batch")).toBeUndefined();
    const finish = async () => {
      release();
      await vi.advanceTimersByTimeAsync(250);
      expect(h.response("batch")).toMatchObject({ result: { applied: true } });
    };
    return { h, before, finish };
  };

  it("does not report this tab's older bytes after another tab's newer commit", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    const { h, before, finish } = await delayedBatch(root);
    const tab = otherTab(root);
    const commit = await tab.write("a.sd", "REMOTE");
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "REMOTE")],
      origin: "LogicScriptEditor:1",
      commits: { [uriOf("a.sd")]: commit },
    });
    await finish();
    expect(h.writtenTexts("a.sd", before).at(-1)).toBe("REMOTE");
    expect((await h.cached("a.sd")).text).toBe("REMOTE");
  });

  it("does not list a file another tab deleted", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    const { h, finish } = await delayedBatch(root);
    const commit = await otherTab(root).remove("a.sd");
    await h.remote("workspace/didDeleteFiles", {
      files: [{ uri: uriOf("a.sd") }],
      commits: { [uriOf("a.sd")]: commit },
    });
    const afterDelete = h.messages.length;
    await finish();
    expect(h.writtenTexts("a.sd", afterDelete)).toEqual([]);
  });

  it("does not list the old name of a file another tab renamed", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    const { h, finish } = await delayedBatch(root);
    const tab = otherTab(root);
    const created = await tab.write("c.sd", "A!");
    const removed = await tab.remove("a.sd");
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("c.sd", "A!")],
      commits: { [uriOf("c.sd")]: created },
    });
    await h.remote("workspace/didRenameFiles", {
      files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("c.sd") }],
      commits: { [uriOf("a.sd")]: removed, [uriOf("c.sd")]: created },
    });
    const afterRename = h.messages.length;
    await finish();
    expect(h.writtenTexts("a.sd", afterRename)).toEqual([]);
  });

  it("drops an older snapshot from another tab that arrives after this tab's newer commit", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const tab = otherTab(root);
    const older = await tab.write("a.sd", "OLDER");
    await h.request("newer", "workspace/willWriteFiles", writeOf("a.sd", "NEWER"));
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "OLDER")],
      commits: { [uriOf("a.sd")]: older },
    });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
    expect((await h.cached("a.sd")).text).toBe("NEWER");
    expect(textAt(root, "a.sd")).toBe("NEWER");
  });

  it("drops an older snapshot of a file this tab only read from storage, and edits the stored text", async () => {
    const root = seed({ "a.sd": "A" });
    const tab = otherTab(root);
    const older = await tab.write("a.sd", "OLDER");
    await tab.write("a.sd", "STORED");
    const h = await worker(root);
    await h.enumerate();
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "OLDER")],
      commits: { [uriOf("a.sd")]: older },
    });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
    expect((await h.cached("a.sd")).text).toBe("STORED");
    await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("a.sd", 6, "!")] },
    });
    expect(textAt(root, "a.sd")).toBe("STORED!");
  });

  it("does not bring back a file deleted before this tab listed storage when an older snapshot of it arrives late", async () => {
    const root = seed({ "b.sd": "B" });
    const tab = otherTab(root);
    const older = await tab.write("a.sd", "OLDER");
    await tab.remove("a.sd");
    const h = await worker(root);
    await h.enumerate();
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "OLDER")],
      commits: { [uriOf("a.sd")]: older },
    });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
    expect(await h.cached("a.sd")).toBeUndefined();
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [insert("a.sd", 5, "!")] },
      }),
    ).toMatchObject({ result: { applied: false } });
    expect(textAt(root, "a.sd")).toBeUndefined();
  });

  it("checks an unstamped notification against storage when the shared sequence cannot be written", async () => {
    const root = seed({ "a.sd": "A" });
    const sequence = new MemoryFile(".opfs-workspace-sequence");
    sequence.createSyncAccessHandle = async () => {
      throw new DOMException("sequence storage unavailable", "QuotaExceededError");
    };
    root.entries.set(sequence.name, sequence);
    const h = await worker(root);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await h.enumerate();
    writeMemoryFile(root, "local/a.sd", enc.encode("OLDER"));
    await h.request("newer", "workspace/willWriteFiles", writeOf("a.sd", "NEWER"));
    const local = h.notifications("workspace/didWriteFiles").at(-1);
    expect(local.params.commits).toEqual({});
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "OLDER")],
    });
    expect(h.writtenTexts("a.sd", before)).toEqual(["NEWER"]);
    expect((await h.cached("a.sd")).text).toBe("NEWER");
    await h.remote("workspace/didDeleteFiles", { files: [{ uri: uriOf("a.sd") }] });
    expect((await h.cached("a.sd")).text).toBe("NEWER");
  });

  it("computes a later edit against the text another tab committed", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const commit = await otherTab(root).write("a.sd", "RA");
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "RA")],
      commits: { [uriOf("a.sd")]: commit },
    });
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [insert("a.sd", 1, "!")] },
      }),
    ).toMatchObject({ result: { applied: true } });
    expect(textAt(root, "a.sd")).toBe("R!A");
  });

  it("initializes the text document of a script another tab created", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const commit = await otherTab(root).write("new.sd", "N");
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("new.sd", "N")],
      commits: { [uriOf("new.sd")]: commit },
    });
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [insert("new.sd", 1, "!")] },
      }),
    ).toMatchObject({ result: { applied: true } });
    expect(textAt(root, "new.sd")).toBe("N!");
  });

  it("keeps a file this tab recreated after another tab's earlier delete arrives late", async () => {
    const root = seed({ "a.sd": "A", "z.sd": "Z" });
    const h = await worker(root);
    await h.enumerate();
    const tab = otherTab(root);
    for (let i = 0; i < 5; i += 1) {
      await tab.write("z.sd", `Z${i}`);
    }
    const deleted = await tab.remove("a.sd");
    await h.request("recreate", "workspace/willCreateFiles", {
      files: [{ uri: uriOf("a.sd"), data: enc.encode("AGAIN").buffer }],
    });
    const before = h.messages.length;
    await h.remote("workspace/didDeleteFiles", {
      files: [{ uri: uriOf("a.sd") }],
      commits: { [uriOf("a.sd")]: deleted },
    });
    await h.remote("workspace/didChangeWatchedFiles", {
      changes: [{ uri: uriOf("a.sd"), type: 3 }],
      commits: { [uriOf("a.sd")]: deleted },
    });
    expect(h.notifications("workspace/didDeleteFiles", before)).toEqual([]);
    expect(
      h.notifications("workspace/didChangeWatchedFiles", before).flatMap((m) => m.params.changes),
    ).toEqual([]);
    expect((await h.cached("a.sd")).text).toBe("AGAIN");
    expect(textAt(root, "a.sd")).toBe("AGAIN");
  });

  it("drops another tab's directory change older than this tab's", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    const tab = otherTab(root);
    makeMemoryDirectory(root, "local/d");
    const created = await tab.commit();
    await h.request("rmdir", "workspace/directories", {
      action: "delete",
      uris: [uriOf("d")],
    });
    const before = h.messages.length;
    await h.remote("workspace/didChangeDirectories", {
      created: [uriOf("d")],
      deleted: [],
      commits: { [uriOf("d")]: created },
    });
    expect(h.notifications("workspace/didChangeDirectories", before)).toEqual([]);
  });

  it("stamps every write, delete and rename notification with its commit", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    await h.request("write", "workspace/willWriteFiles", writeOf("a.sd", "W"));
    await h.request("rename", "workspace/willRenameFiles", {
      files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") }],
    });
    await h.request("delete", "workspace/willDeleteFiles", { files: [{ uri: uriOf("b.sd") }] });
    const stamped = h.messages.filter((m) =>
      [
        "workspace/didWriteFiles",
        "workspace/didRenameFiles",
        "workspace/didDeleteFiles",
        "workspace/didChangeWatchedFiles",
      ].includes(m.method),
    );
    for (const m of stamped) {
      const uris = [
        ...(m.params.files ?? []).flatMap((f: any) => [f.uri, f.oldUri, f.newUri]),
        ...(m.params.changes ?? []).map((c: any) => c.uri),
      ].filter(Boolean);
      for (const uri of uris) {
        expect(m.params.commits?.[uri], `${m.method} ${uri}`).toMatchObject({
          sequence: expect.any(Number),
          writer: expect.any(String),
        });
      }
    }
    const sequences = ["workspace/didWriteFiles", "workspace/didRenameFiles", "workspace/didDeleteFiles"].map(
      (method) => {
        const m = stamped.filter((s) => s.method === method).at(-1);
        return Math.max(...Object.values<any>(m.params.commits).map((c) => c.sequence));
      },
    );
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
  });
});

describe("notifications without commits, from a tab on an older build (I-1893)", () => {
  it("forwards and edits the stored text of an unstamped write after this tab's stamped write", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    await h.request("local", "workspace/willWriteFiles", writeOf("a.sd", "LOCAL", "editor"));
    writeMemoryFile(root, "local/a.sd", enc.encode("LEGACY"));
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", { files: [fileData("a.sd", "LEGACY")] });
    expect(h.writtenTexts("a.sd", before)).toEqual(["LEGACY"]);
    expect((await h.cached("a.sd")).text).toBe("LEGACY");
    await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("a.sd", 6, "!")] },
    });
    expect(textAt(root, "a.sd")).toBe("LEGACY!");
  });

  it("drops an unstamped delete and its watched-file deletion once the file is stored again", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    await h.request("recreate", "workspace/willWriteFiles", writeOf("a.sd", "RECREATED", "editor"));
    const before = h.messages.length;
    await h.remote("workspace/didDeleteFiles", { files: [{ uri: uriOf("a.sd") }] });
    await h.remote("workspace/didChangeWatchedFiles", {
      changes: [{ uri: uriOf("a.sd"), type: 3 }],
    });
    expect(h.notifications("workspace/didDeleteFiles", before)).toEqual([]);
    expect(
      h.notifications("workspace/didChangeWatchedFiles", before).flatMap((m) => m.params.changes),
    ).toEqual([]);
    expect((await h.cached("a.sd")).text).toBe("RECREATED");
  });

  it("drops an unstamped directory deletion once the directory exists again", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    await h.request("mkdir", "workspace/directories", {
      action: "create",
      uris: [uriOf("kept")],
    });
    const before = h.messages.length;
    await h.remote("workspace/didChangeDirectories", {
      created: [],
      deleted: [uriOf("kept")],
    });
    expect(h.notifications("workspace/didChangeDirectories", before)).toEqual([]);
    expect(entryAt(root, "kept")).toBeInstanceOf(MemoryDirectory);
  });

  it("creates no directory while checking an unstamped notification under a deleted one", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    const gone = uriOf("gone/a.sd");
    await h.remote("workspace/didWriteFiles", { files: [fileData("gone/a.sd", "X")] });
    await h.remote("workspace/didDeleteFiles", { files: [{ uri: gone }] });
    await h.remote("workspace/didRenameFiles", {
      files: [{ oldUri: gone, newUri: uriOf("b.sd") }],
    });
    await h.remote("workspace/didChangeWatchedFiles", { changes: [{ uri: gone, type: 1 }] });
    expect(entryAt(root, "gone")).toBeUndefined();
    expect(listMemory(root, "local")).toEqual(["a.sd"]);
  });
});

describe("listing storage after earlier notifications (I-1893)", () => {
  it("drops a delayed write older than a listing that no longer holds the file, even after an earlier create was accepted", async () => {
    const root = seed({ "a.sd": "OLD" });
    const h = await worker(root);
    const tab = otherTab(root);
    const created = await tab.commit();
    await h.remote("workspace/didCreateFiles", {
      files: [{ uri: uriOf("a.sd") }],
      commits: { [uriOf("a.sd")]: created },
    });
    await tab.remove("a.sd");
    expect((await h.enumerate()).result).toEqual([]);
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "OLD")],
      commits: { [uriOf("a.sd")]: created },
    });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [insert("a.sd", 3, "!")] },
      }),
    ).toMatchObject({ result: { applied: false } });
    expect(textAt(root, "a.sd")).toBeUndefined();
  });

  it("does not let a read that started before a newer listing bring back a file the listing found absent", async () => {
    const root = seed({ "a.sd": "A" });
    const source = fileAt(root, "a.sd")!;
    const h = await worker(root);
    const read = source.getFile.bind(source);
    let captured!: () => void;
    const reading = new Promise<void>((resolve) => {
      captured = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    source.getFile = async () => {
      const snapshot = await read();
      return {
        ...snapshot,
        arrayBuffer: async () => {
          captured();
          await held;
          return snapshot.arrayBuffer();
        },
      };
    };
    h.start("old-read", "workspace/readFile", { file: { uri: uriOf("a.sd") } });
    await vi.advanceTimersByTimeAsync(0);
    await reading;
    await otherTab(root).remove("a.sd");
    expect((await h.enumerate()).result).toEqual([]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.response("old-read")).toHaveProperty("result");
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [insert("a.sd", 1, "!")] },
      }),
    ).toMatchObject({ result: { applied: false } });
    expect(textAt(root, "a.sd")).toBeUndefined();
  });

  it("reads a cached file again when a listing is newer than the commit it holds, and tells the page", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const tab = otherTab(root);
    const newer = await tab.write("a.sd", "NEWER");
    const listing = h.messages.length;
    expect((await h.cached("a.sd")).text).toBe("NEWER");
    expect(h.writtenTexts("a.sd", listing)).toEqual(["NEWER"]);
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "NEWER")],
      commits: { [uriOf("a.sd")]: newer },
    });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
  });
});

describe("schedules across several tabs (I-1893)", () => {
  it("keeps the stored text of an unstamped write over a stamped snapshot it already contains", async () => {
    const root = seed({ "a.sd": "OLD" });
    const h = await worker(root);
    await h.enumerate();
    const old = await otherTab(root).commit();
    writeMemoryFile(root, "local/a.sd", enc.encode("LEGACY"));
    await h.remote("workspace/didWriteFiles", { files: [fileData("a.sd", "LEGACY")] });
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "OLD")],
      commits: { [uriOf("a.sd")]: old },
    });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
    await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("a.sd", 0, "!")] },
    });
    expect(textAt(root, "a.sd")).toBe("!LEGACY");
  });

  it("drops a delayed write under a directory whose newer removal this tab accepted", async () => {
    const root = seed({ "main.sd": "M", "d/a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const writer = otherTab(root);
    const old = await writer.write("d/a.sd", "OLD-SNAPSHOT");
    await writer.remove("d/a.sd");
    await (root.entries.get("local") as MemoryDirectory).removeEntry("d");
    const removed = await writer.commit();
    await h.remote("workspace/didChangeDirectories", {
      created: [],
      deleted: [uriOf("d")],
      commits: { [uriOf("d")]: removed },
    });
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("d/a.sd", "OLD-SNAPSHOT")],
      commits: { [uriOf("d/a.sd")]: old },
    });
    expect(h.writtenTexts("d/a.sd", before)).toEqual([]);
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [insert("d/a.sd", 0, "!")] },
      }),
    ).toMatchObject({ result: { applied: false } });
    expect(textAt(root, "d/a.sd")).toBeUndefined();
  });

  it("drops an older directory removal after accepting another tab's newer write inside that directory", async () => {
    const root = seed({ "main.sd": "M" }, ["d"]);
    const h = await worker(root);
    await h.enumerate();
    const tab = otherTab(root);
    await (root.entries.get("local") as MemoryDirectory).removeEntry("d");
    const removed = await tab.commit();
    const newer = await tab.write("d/new.sd", "NEW");
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("d/new.sd", "NEW")],
      commits: { [uriOf("d/new.sd")]: newer },
    });
    const before = h.messages.length;
    await h.remote("workspace/didChangeDirectories", {
      created: [],
      deleted: [uriOf("d")],
      commits: { [uriOf("d")]: removed },
    });
    expect(h.notifications("workspace/didChangeDirectories", before)).toEqual([]);
  });

  it("does not announce a delayed batch's unstamped text after a later local save when the shared sequence is unavailable", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    const counter = new MemoryFile(".opfs-workspace-sequence");
    counter.createSyncAccessHandle = async () => {
      throw new DOMException("counter unavailable", "QuotaExceededError");
    };
    root.entries.set(counter.name, counter);
    const h = await worker(root);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await h.enumerate();
    let release!: () => void;
    fileAt(root, "b.sd")!.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.start("batch", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("a.sd", 1, "!"), insert("b.sd", 1, "!")] },
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(textAt(root, "a.sd")).toBe("A!");
    await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "NEW", "editor"));
    const before = h.messages.length;
    release();
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("batch")).toMatchObject({ result: { applied: true } });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
  });
});

describe("what another tab's notification proves about parents and absent files (I-1893)", () => {
  it.each(["write", "directory"])(
    "does not announce this tab's pending removal of a directory after accepting another tab's newer %s inside it",
    async (kind) => {
      const root = seed({ "main.sd": "M" }, ["d", "e"]);
      const h = await worker(root);
      const project = root.entries.get("local") as MemoryDirectory;
      const remove = project.removeEntry.bind(project);
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      project.removeEntry = async (name: string, options?: { recursive?: boolean }) => {
        await remove(name, options);
        if (name === "e") await held;
      };
      h.start("remove", "workspace/directories", {
        action: "delete",
        uris: [uriOf("d"), uriOf("e")],
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(entryAt(root, "d")).toBeUndefined();
      const tab = otherTab(root);
      if (kind === "write") {
        const newer = await tab.write("d/new.sd", "NEW");
        await h.remote("workspace/didWriteFiles", {
          files: [fileData("d/new.sd", "NEW")],
          commits: { [uriOf("d/new.sd")]: newer },
        });
      } else {
        makeMemoryDirectory(root, "local/d/child");
        const newer = await tab.commit();
        await h.remote("workspace/didChangeDirectories", {
          created: [uriOf("d/child")],
          deleted: [],
          commits: { [uriOf("d/child")]: newer },
        });
      }
      const before = h.messages.length;
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(h.response("remove")).toHaveProperty("result");
      expect(
        h.notifications("workspace/didChangeDirectories", before).flatMap((m) => m.params.deleted),
      ).not.toContain(uriOf("d"));
    },
  );

  it.each(["delete", "rename", "write"])(
    "keeps a file absent after an unstamped %s confirmed its absence, when an older stamped write arrives late",
    async (kind) => {
      const root = seed({ "a.sd": "OLD" });
      const h = await worker(root);
      await h.enumerate();
      const old = await otherTab(root).commit();
      await (root.entries.get("local") as MemoryDirectory).removeEntry("a.sd");
      if (kind === "rename") {
        writeMemoryFile(root, "local/b.sd", enc.encode("OLD"));
        await h.remote("workspace/didRenameFiles", {
          files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") }],
        });
      } else if (kind === "delete") {
        await h.remote("workspace/didDeleteFiles", { files: [{ uri: uriOf("a.sd") }] });
      } else {
        await h.remote("workspace/didWriteFiles", { files: [fileData("a.sd", "OLD")] });
      }
      const before = h.messages.length;
      await h.remote("workspace/didWriteFiles", {
        files: [fileData("a.sd", "OLD")],
        commits: { [uriOf("a.sd")]: old },
      });
      expect(h.writtenTexts("a.sd", before)).toEqual([]);
      expect(
        await h.request("edit", "workspace/applyWorkspaceEdit", {
          edit: { documentChanges: [insert("a.sd", 0, "!")] },
        }),
      ).toMatchObject({ result: { applied: false } });
      expect(textAt(root, "a.sd")).toBeUndefined();
    },
  );

  it("evicts the cached files under a directory whose unstamped removal storage confirms", async () => {
    const root = seed({ "main.sd": "M", "d/a.sd": "OLD" });
    const h = await worker(root);
    await h.enumerate();
    await (root.entries.get("local") as MemoryDirectory).removeEntry("d", { recursive: true });
    await h.remote("workspace/didChangeDirectories", { created: [], deleted: [uriOf("d")] });
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [insert("d/a.sd", 0, "!")] },
      }),
    ).toMatchObject({ result: { applied: false } });
    expect(entryAt(root, "d")).toBeUndefined();
  });

  it("drops an older stamped removal of the parent of a file whose unstamped write storage confirms", async () => {
    const root = seed({ "main.sd": "M" }, ["d"]);
    const h = await worker(root);
    await h.enumerate();
    await (root.entries.get("local") as MemoryDirectory).removeEntry("d");
    const removed = await otherTab(root).commit();
    writeMemoryFile(root, "local/d/new.sd", enc.encode("LEGACY"));
    await h.remote("workspace/didWriteFiles", { files: [fileData("d/new.sd", "LEGACY")] });
    const before = h.messages.length;
    await h.remote("workspace/didChangeDirectories", {
      created: [],
      deleted: [uriOf("d")],
      commits: { [uriOf("d")]: removed },
    });
    expect(h.notifications("workspace/didChangeDirectories", before)).toEqual([]);
    expect((await h.cached("d/new.sd")).text).toBe("LEGACY");
  });
});

describe("reads that see newer storage (I-1893)", () => {
  it.each(["listing", "read"])(
    "drops a stamped snapshot older than legacy bytes this tab's %s already saw",
    async (kind) => {
      const root = seed({ "main.sd": "M", "a.sd": "OLD" });
      const old = await otherTab(root).commit();
      writeMemoryFile(root, "local/a.sd", enc.encode("LEGACY"));
      const h = await worker(root);
      if (kind === "listing") {
        await h.enumerate();
      } else {
        await h.request("read", "workspace/readFile", { file: { uri: uriOf("a.sd") } });
      }
      const before = h.messages.length;
      await h.remote("workspace/didWriteFiles", {
        files: [fileData("a.sd", "OLD")],
        commits: { [uriOf("a.sd")]: old },
      });
      expect(h.writtenTexts("a.sd", before)).toEqual([]);
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [insert("a.sd", 0, "!")] },
      });
      expect(textAt(root, "a.sd")).toBe("!LEGACY");
    },
  );

  it("does not announce a delayed batch's text after a listing found newer bytes for that file", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    const h = await worker(root);
    await h.enumerate();
    let release!: () => void;
    fileAt(root, "b.sd")!.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.start("batch", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("a.sd", 1, "!"), insert("b.sd", 1, "!")] },
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(textAt(root, "a.sd")).toBe("A!");
    await otherTab(root).write("a.sd", "NEWER");
    const listing = h.messages.length;
    expect((await h.cached("a.sd")).text).toBe("NEWER");
    expect(h.writtenTexts("a.sd", listing)).toEqual(["NEWER"]);
    const before = h.messages.length;
    release();
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("batch")).toMatchObject({ result: { applied: true } });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
  });
});

describe("the shared sequence (I-1893)", () => {
  it("never lowers the stored sequence when writing it fails", async () => {
    const root = memoryRoot();
    const counter = new MemoryFile(".opfs-workspace-sequence");
    counter.bytes = enc.encode("5");
    const access = counter.createSyncAccessHandle.bind(counter);
    let failures = 1;
    counter.createSyncAccessHandle = async () => {
      const handle = await access();
      return {
        ...handle,
        write: (data: DataView | Uint8Array, options?: { at?: number }) => {
          if (failures > 0) {
            failures -= 1;
            throw new DOMException("disk full", "QuotaExceededError");
          }
          return handle.write(data, options);
        },
      };
    };
    root.entries.set(counter.name, counter);
    vi.stubGlobal("navigator", { locks: memoryLocks() });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const handle = root as unknown as FileSystemDirectoryHandle;
    expect(await allocateCommit(handle, "tab", 0)).toBeUndefined();
    expect(Number.parseInt(dec.decode(counter.bytes), 10)).toBe(5);
    expect(await allocateCommit(handle, "tab", 0)).toEqual({ sequence: 6, writer: "tab" });
  });
});

describe("directory notifications (I-1893)", () => {
  it("numbers a directory removal and a write inside it in the order they reach storage", async () => {
    const root = seed({ "a.sd": "A" }, ["d"]);
    const h = await worker(root);
    const project = root.entries.get("local") as MemoryDirectory;
    const remove = project.removeEntry.bind(project);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    project.removeEntry = async (name: string, options?: { recursive?: boolean }) => {
      await remove(name, options);
      if (name === "d") await gate;
    };
    h.start("rmdir", "workspace/directories", { action: "delete", uris: [uriOf("d")] });
    await vi.advanceTimersByTimeAsync(50);
    h.start("write", "workspace/willWriteFiles", writeOf("d/x.sd", "NEW", "editor"));
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("write")).toBeUndefined();
    release();
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("rmdir")).toMatchObject({ result: { uris: [uriOf("d")] } });
    expect(h.response("write")).toMatchObject({ result: [{ text: "NEW" }] });
    const removal = h.notifications("workspace/didChangeDirectories").at(-1).params.commits[uriOf("d")];
    const write = h.notifications("workspace/didWriteFiles").at(-1).params.commits[uriOf("d/x.sd")];
    expect(write.sequence).toBeGreaterThan(removal.sequence);
    expect(textAt(root, "d/x.sd")).toBe("NEW");
  });

  it("drops a delayed deletion of a directory this tab recreated by creating a folder inside it", async () => {
    const root = seed({ "a.sd": "A" }, ["d"]);
    const h = await worker(root);
    const tab = otherTab(root);
    (root.entries.get("local") as MemoryDirectory).entries.delete("d");
    const removed = await tab.commit();
    await h.request("mkdir", "workspace/directories", {
      action: "create",
      uris: [uriOf("d/child")],
    });
    const before = h.messages.length;
    await h.remote("workspace/didChangeDirectories", {
      created: [],
      deleted: [uriOf("d")],
      commits: { [uriOf("d")]: removed },
    });
    expect(h.notifications("workspace/didChangeDirectories", before)).toEqual([]);
    expect(entryAt(root, "d/child")).toBeInstanceOf(MemoryDirectory);
  });

  it("drops a delayed deletion of a directory this tab recreated by writing a file inside it", async () => {
    const root = seed({ "a.sd": "A" }, ["d"]);
    const h = await worker(root);
    const tab = otherTab(root);
    (root.entries.get("local") as MemoryDirectory).entries.delete("d");
    const removed = await tab.commit();
    await h.request("write", "workspace/willWriteFiles", writeOf("d/x.sd", "X"));
    const before = h.messages.length;
    await h.remote("workspace/didChangeDirectories", {
      created: [],
      deleted: [uriOf("d")],
      commits: { [uriOf("d")]: removed },
    });
    expect(h.notifications("workspace/didChangeDirectories", before)).toEqual([]);
  });
});

describe("renaming files (I-1910)", () => {
  it("leaves the source in place and unchanged when the destination cannot be created", async () => {
    const root = seed({ "a.txt": [7, 7] }, ["dest"]);
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [{ oldUri: uriOf("a.txt"), newUri: uriOf("dest") }],
      }),
    ).toHaveProperty("error");
    expect([...fileAt(root, "a.txt")!.bytes]).toEqual([7, 7]);
    expect(h.notifications("workspace/didRenameFiles")).toEqual([]);
  });

  it("moves the other files of a batch, loses none and reports only the moves that happened", async () => {
    const root = seed({ "a.txt": [7], "b.txt": [8] }, ["dest"]);
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [
          { oldUri: uriOf("a.txt"), newUri: uriOf("dest") },
          { oldUri: uriOf("b.txt"), newUri: uriOf("c.txt") },
        ],
      }),
    ).toHaveProperty("error");
    expect(listMemory(root, "local")).toEqual(["a.txt", "c.txt", "dest/"]);
    expect([...fileAt(root, "a.txt")!.bytes]).toEqual([7]);
    expect([...fileAt(root, "c.txt")!.bytes]).toEqual([8]);
    expect(h.notifications("workspace/didRenameFiles").map((m) => m.params.files)).toEqual([
      [{ oldUri: uriOf("b.txt"), newUri: uriOf("c.txt") }],
    ]);
  });

  it("vacates a destination that is another move's source before writing it", async () => {
    const root = seed({ "x.txt": [1], "y.txt": [2] });
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [
          { oldUri: uriOf("x.txt"), newUri: uriOf("y.txt") },
          { oldUri: uriOf("y.txt"), newUri: uriOf("z.txt") },
        ],
      }),
    ).toHaveProperty("result");
    expect(listMemory(root, "local")).toEqual(["y.txt", "z.txt"]);
    expect([...fileAt(root, "y.txt")!.bytes]).toEqual([1]);
    expect([...fileAt(root, "z.txt")!.bytes]).toEqual([2]);
  });

  it("does not overwrite a file whose own move failed", async () => {
    const root = seed({ "x.txt": [1], "y.txt": [2] }, ["dest"]);
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [
          { oldUri: uriOf("x.txt"), newUri: uriOf("y.txt") },
          { oldUri: uriOf("y.txt"), newUri: uriOf("dest") },
        ],
      }),
    ).toHaveProperty("error");
    expect([...fileAt(root, "x.txt")!.bytes]).toEqual([1]);
    expect([...fileAt(root, "y.txt")!.bytes]).toEqual([2]);
  });

  it("refuses a batch that swaps two files without touching either", async () => {
    const root = seed({ "x.txt": [1], "y.txt": [2] });
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [
          { oldUri: uriOf("x.txt"), newUri: uriOf("y.txt") },
          { oldUri: uriOf("y.txt"), newUri: uriOf("x.txt") },
        ],
      }),
    ).toHaveProperty("error");
    expect([...fileAt(root, "x.txt")!.bytes]).toEqual([1]);
    expect([...fileAt(root, "y.txt")!.bytes]).toEqual([2]);
  });

  it("keeps a save that lands on the source while the rename is writing its destination", async () => {
    const root = seed({ "a.sd": "OLD", "b.sd": "DEST" });
    const h = await worker(root);
    await h.enumerate();
    let release!: () => void;
    fileAt(root, "b.sd")!.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.start("rename", "workspace/willRenameFiles", {
      files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") }],
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("rename")).toBeUndefined();
    expect(
      await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "SAVED", "editor")),
    ).toMatchObject({ result: [{ text: "SAVED" }] });
    fileAt(root, "b.sd")!.gate = undefined;
    release();
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("rename")).toHaveProperty("result");
    expect(textAt(root, "a.sd")).toBeUndefined();
    expect(textAt(root, "b.sd")).toBe("SAVED");
  });

  it("commits a queued save to the source before the rename copies it", async () => {
    const root = seed({ "a.sd": "OLD" });
    const h = await worker(root);
    await h.enumerate();
    h.start("save", "workspace/willWriteFiles", writeOf("a.sd", "QUEUED", "editor"));
    await h.request("rename", "workspace/willRenameFiles", {
      files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") }],
    });
    expect(h.response("save")).toMatchObject({ result: [{ text: "QUEUED" }] });
    expect(textAt(root, "a.sd")).toBeUndefined();
    expect(textAt(root, "b.sd")).toBe("QUEUED");
  });

  it("commits a queued save to a file before moving it to the trash", async () => {
    const root = seed({ "a.sd": "OLD" });
    const h = await worker(root);
    await h.enumerate();
    h.start("save", "workspace/willWriteFiles", writeOf("a.sd", "QUEUED", "editor"));
    expect(
      await h.request("trash", "workspace/willDeleteFiles", {
        files: [{ uri: uriOf("a.sd") }],
        mode: "trash",
      }),
    ).toHaveProperty("result");
    expect(textAt(root, "a.sd")).toBeUndefined();
    const trashed = listMemory(root, "local").find((p) => /^\.trash\/[^/]+\/a\.sd$/.test(p));
    expect(trashed && textAt(root, trashed)).toBe("QUEUED");
  });

  it("keeps both files when the rename's write onto an existing destination fails", async () => {
    const root = seed({ "a.sd": "SOURCE", "b.sd": "DESTINATION" });
    const destination = fileAt(root, "b.sd")!;
    const access = destination.createSyncAccessHandle.bind(destination);
    destination.createSyncAccessHandle = async () => {
      const handle = await access();
      let failed = false;
      return {
        ...handle,
        write: (data: DataView | Uint8Array) => {
          if (!failed) {
            failed = true;
            throw new DOMException("disk full", "QuotaExceededError");
          }
          return handle.write(data);
        },
      };
    };
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") }],
      }),
    ).toHaveProperty("error");
    expect(textAt(root, "a.sd")).toBe("SOURCE");
    expect(textAt(root, "b.sd")).toBe("DESTINATION");
  });

  it("leaves an existing destination untouched when reading its previous bytes fails", async () => {
    const root = seed({ "a.sd": "SOURCE", "b.sd": "DESTINATION" });
    const destination = fileAt(root, "b.sd")!;
    const access = destination.createSyncAccessHandle.bind(destination);
    destination.createSyncAccessHandle = async () => ({
      ...(await access()),
      read: () => {
        throw new DOMException("transient read failure", "UnknownError");
      },
    });
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") }],
      }),
    ).toHaveProperty("error");
    expect(textAt(root, "a.sd")).toBe("SOURCE");
    expect(textAt(root, "b.sd")).toBe("DESTINATION");
  });

  it("leaves a file renamed onto itself in place and in the cache", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("a.sd") }],
      }),
    ).toMatchObject({ result: [{ uri: uriOf("a.sd"), text: "A" }] });
    expect(textAt(root, "a.sd")).toBe("A");
    expect(h.notifications("workspace/didRenameFiles")).toEqual([]);
  });
});
