import { afterEach, describe, expect, it, vi } from "vitest";
import { allocateCommit } from "../src/utils/commitSequence";
import { reloadsForWrite } from "../../../impower-dev/src/modules/spark-editor/components/logic-script-editor/reloadsForWrite";
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
  const channelPosts: any[] = [];
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
      postMessage(message: unknown) {
        channelPosts.push(structuredClone(message));
      }
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
  return { messages, channelPosts, start, response, request, remote, enumerate, cached, notifications, writtenTexts };
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

  it("announces stored bytes, not a sequence, for a commit whose shared sequence cannot be written", async () => {
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
    expect(local.params.files.map((f: any) => f.text)).toEqual(["NEWER"]);
    expect(
      Object.values<any>(local.params.commits ?? {}).every((c) => c.writer === "\uffff"),
    ).toBe(true);
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("a.sd", "OLDER")],
    });
    expect(h.writtenTexts("a.sd", before)).toEqual(["NEWER"]);
    expect((await h.cached("a.sd")).text).toBe("NEWER");
    const afterWrite = h.messages.length;
    await h.remote("workspace/didDeleteFiles", { files: [{ uri: uriOf("a.sd") }] });
    expect(h.notifications("workspace/didDeleteFiles", afterWrite)).toEqual([]);
    expect(h.writtenTexts("a.sd", afterWrite)).toEqual(["NEWER"]);
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

  it("announces the stored file, not a deletion, for an unstamped delete of a file stored again", async () => {
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
      h
        .notifications("workspace/didChangeWatchedFiles", before)
        .flatMap((m) => m.params.changes)
        .filter((c: any) => c.type === 3),
    ).toEqual([]);
    expect(h.writtenTexts("a.sd", before).every((text) => text === "RECREATED")).toBe(true);
    expect((await h.cached("a.sd")).text).toBe("RECREATED");
  });

  it("announces the stored directory, not a deletion, for an unstamped deletion of a directory that exists again", async () => {
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
    const changes = h.notifications("workspace/didChangeDirectories", before);
    expect(changes.flatMap((m) => m.params.deleted)).toEqual([]);
    expect(changes.flatMap((m) => m.params.created)).toEqual([uriOf("kept")]);
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
    const removed = navigator.locks.request(
      `opfs-workspace:commit:${uriOf("a.sd")}`,
      () => otherTab(root).remove("a.sd"),
    );
    h.start("listing", "workspace/readDirectoryFiles", {
      directory: { uri: "file://local" },
    });
    await vi.advanceTimersByTimeAsync(0);
    release();
    await removed;
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("listing").result).toEqual([]);
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

  it("keeps a file that a tab on an older build recreated while a listing that found it absent was still running", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    await otherTab(root).commit();
    const h = await worker(root);
    await h.enumerate();
    await (root.entries.get("local") as MemoryDirectory).removeEntry("a.sd");
    await otherTab(root).commit();
    const b = fileAt(root, "b.sd")!;
    const getFile = b.getFile.bind(b);
    let captured!: () => void;
    const listing = new Promise<void>((resolve) => {
      captured = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    b.getFile = async () => {
      b.getFile = getFile;
      captured();
      await held;
      return getFile();
    };
    h.start("listing", "workspace/readDirectoryFiles", {
      directory: { uri: "file://local" },
    });
    await vi.advanceTimersByTimeAsync(0);
    await listing;
    writeMemoryFile(root, "local/a.sd", enc.encode("BACK"));
    await h.remote("workspace/didWriteFiles", { files: [fileData("a.sd", "BACK")] });
    await vi.advanceTimersByTimeAsync(50);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(
      h.response("listing").result.map((f: any) => [f.uri, f.text]),
    ).toContainEqual([uriOf("a.sd"), "BACK"]);
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [insert("a.sd", 0, "!")] },
      }),
    ).toMatchObject({ result: { applied: true } });
    expect(textAt(root, "a.sd")).toBe("!BACK");
  });

  it("returns the other files when another tab deletes a listed file while the listing runs", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    await otherTab(root).commit();
    const h = await worker(root);
    const a = fileAt(root, "a.sd")!;
    const getFile = a.getFile.bind(a);
    let captured!: () => void;
    const reached = new Promise<void>((resolve) => {
      captured = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    a.getFile = async () => {
      a.getFile = getFile;
      captured();
      await held;
      if (fileAt(root, "a.sd") !== a) {
        throw new DOMException("a.sd was deleted", "NotFoundError");
      }
      return getFile();
    };
    h.start("listing", "workspace/readDirectoryFiles", {
      directory: { uri: "file://local" },
    });
    await vi.advanceTimersByTimeAsync(0);
    await reached;
    const removed = navigator.locks.request(
      `opfs-workspace:commit:${uriOf("a.sd")}`,
      () => otherTab(root).remove("a.sd"),
    );
    await vi.advanceTimersByTimeAsync(0);
    release();
    await removed;
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("listing")).not.toHaveProperty("error");
    expect(h.response("listing").result.map((f: any) => f.uri)).toContain(
      uriOf("b.sd"),
    );
    expect((await h.enumerate()).result.map((f: any) => f.uri)).toEqual([
      uriOf("b.sd"),
    ]);
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

  it("announces only stored text when a delayed batch finishes after a later local save and the shared sequence is unavailable", async () => {
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
    expect(h.writtenTexts("a.sd", before).every((text) => text === "NEW")).toBe(true);
    expect((await h.cached("a.sd")).text).toBe("NEW");
    expect(textAt(root, "a.sd")).toBe("NEW");
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
    await h.request("read", "workspace/readFile", { file: { uri: uriOf("a.sd") } });
    expect(h.writtenTexts("a.sd", listing)).toEqual(["NEWER"]);
    const before = h.messages.length;
    release();
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("batch")).toMatchObject({ result: { applied: true } });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
    expect((await h.cached("a.sd")).text).toBe("NEWER");
  });
});

describe("reads create no directories", () => {
  it("creates no parent directory when reading a missing file", async () => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    expect(
      await h.request("read", "workspace/readFile", { file: { uri: uriOf("missing/deeper/a.sd") } }),
    ).toHaveProperty("error");
    expect(listMemory(root, "local")).toEqual(["a.sd"]);
  });

  it("creates no parent directory when an exported file's folder is gone by the time the export reads it", async () => {
    const root = seed({ "a.sd": "A", "gone/b.png": [1, 2] });
    const h = await worker(root);
    const listed = await h.enumerate();
    expect(listed.result.map((f: any) => f.uri)).toContain(uriOf("gone/b.png"));
    await (root.entries.get("local") as MemoryDirectory).removeEntry("gone", { recursive: true });
    expect(
      await h.request("zip", "workspace/zipFiles", {
        files: [
          { uri: uriOf("a.sd"), path: "a.sd" },
          { uri: uriOf("gone/b.png"), path: "gone/b.png" },
        ],
      }),
    ).toHaveProperty("error");
    expect(entryAt(root, "gone")).toBeUndefined();
    expect(listMemory(root, "local")).toEqual(["a.sd"]);
  });

  it("creates no parent directory when a listed file's folder is gone by the time it is stated", async () => {
    const root = seed({ "a.sd": "A" });
    const project = root.entries.get("local") as MemoryDirectory;
    const phantom = new MemoryDirectory("ghost");
    phantom.entries.set("b.png", new MemoryFile("b.png"));
    const listed = project.values.bind(project);
    project.values = async function* () {
      yield* listed();
      yield phantom;
    };
    const h = await worker(root);
    void (globalThis as any).onmessage({
      data: {
        jsonrpc: "2.0",
        method: "workspace/didChangeConfiguration",
        params: { settings: { imageFiles: "*.png" } },
      },
    });
    await h.enumerate();
    project.values = listed;
    expect(entryAt(root, "ghost")).toBeUndefined();
    expect(listMemory(root, "local")).toEqual(["a.sd"]);
  });

  it.each([
    ["readDirectoryFiles", "workspace/readDirectoryFiles", { directory: { uri: "file://local/gone/deeper" } }],
    ["directories list", "workspace/directories", { action: "list", directory: { uri: "file://local/gone/deeper" } }],
    ["trash list", "workspace/trashFiles", { projectId: "local", action: "list" }],
    ["trash purge", "workspace/trashFiles", { projectId: "local", action: "purge", retentionMs: 0 }],
    ["delete", "workspace/willDeleteFiles", { files: [{ uri: "file://local/gone/deeper/a.sd" }] }],
  ])("creates no directory for a %s of a missing path", async (_name, method, params) => {
    const root = seed({ "a.sd": "A" });
    const h = await worker(root);
    await h.request("probe", method, params);
    expect(h.response("probe")).toBeDefined();
    expect(listMemory(root, "local")).toEqual(["a.sd"]);
  });
});

describe("reads that overlap a settle (I-1893)", () => {
  it("keeps the settled text when a read that started before the settle finishes after it", async () => {
    const root = seed({ "a.sd": "OLD", "b.sd": "B" });
    const h = await worker(root);
    await h.enumerate();
    const file = fileAt(root, "a.sd")!;
    const getFile = file.getFile.bind(file);
    let captured!: () => void;
    const reading = new Promise<void>((resolve) => {
      captured = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    file.getFile = async () => {
      const snapshot = await getFile();
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
    file.getFile = getFile;
    writeMemoryFile(root, "local/a.sd", enc.encode("NEW"));
    await h.remote("workspace/didWriteFiles", { files: [fileData("a.sd", "IGNORED")] });
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(h.response("old-read")).toHaveProperty("result");
    expect(h.writtenTexts("a.sd").at(-1)).toBe("NEW");
    expect((await h.cached("a.sd")).text).toBe("NEW");
  });

  const holdNextRead = (file: MemoryFile) => {
    const getFile = file.getFile.bind(file);
    let captured!: () => void;
    const capturing = new Promise<void>((resolve) => {
      captured = resolve;
    });
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    file.getFile = async () => {
      const snapshot = await getFile();
      file.getFile = getFile;
      return {
        ...snapshot,
        arrayBuffer: async () => {
          captured();
          await held;
          return snapshot.arrayBuffer();
        },
      };
    };
    return { capturing, release };
  };

  it.each([true, false])(
    "ends on the later of two overlapping reads (file cached first: %s)",
    async (cachedFirst) => {
      const root = seed({ "a.sd": "BASE", "b.sd": "B" });
      const h = await worker(root);
      if (cachedFirst) {
        await h.enumerate();
      }
      writeMemoryFile(root, "local/a.sd", enc.encode("OLDER"));
      const first = holdNextRead(fileAt(root, "a.sd")!);
      h.start("first", "workspace/readFile", { file: { uri: uriOf("a.sd") } });
      await vi.advanceTimersByTimeAsync(0);
      await first.capturing;
      writeMemoryFile(root, "local/a.sd", enc.encode("NEWER"));
      const second = holdNextRead(fileAt(root, "a.sd")!);
      h.start("second", "workspace/readFile", { file: { uri: uriOf("a.sd") } });
      await vi.advanceTimersByTimeAsync(0);
      const releases = cachedFirst
        ? [first.release, second.release]
        : [second.release, first.release];
      for (const release of releases) {
        release();
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(dec.decode(h.response("first").result)).toBe("OLDER");
      expect(dec.decode(h.response("second").result)).toBe("NEWER");
      expect((await h.cached("a.sd")).text).toBe("NEWER");
      if (cachedFirst) {
        expect(h.writtenTexts("a.sd").at(-1)).toBe("NEWER");
      }
    },
  );

  it("ends on a newer read that overlapped a settle of an unstamped notification", async () => {
    const root = seed({ "a.sd": "BASE", "b.sd": "B" });
    const h = await worker(root);
    await h.enumerate();
    writeMemoryFile(root, "local/a.sd", enc.encode("OLDER"));
    const settle = holdNextRead(fileAt(root, "a.sd")!);
    const before = h.messages.length;
    await h.remote("workspace/didWriteFiles", { files: [fileData("a.sd", "UNTRUSTED")] });
    await settle.capturing;
    writeMemoryFile(root, "local/a.sd", enc.encode("NEWER"));
    h.start("read", "workspace/readFile", { file: { uri: uriOf("a.sd") } });
    await vi.advanceTimersByTimeAsync(0);
    settle.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(dec.decode(h.response("read").result)).toBe("NEWER");
    expect(h.writtenTexts("a.sd", before)).not.toContain("UNTRUSTED");
    expect(h.writtenTexts("a.sd", before).at(-1)).toBe("NEWER");
    expect((await h.cached("a.sd")).text).toBe("NEWER");
  });

  it("does not publish a delayed settle's snapshot after a later save of the same file", async () => {
    const root = seed({ "a.sd": "OLD", "b.sd": "B" });
    const sequence = new MemoryFile(".opfs-workspace-sequence");
    sequence.createSyncAccessHandle = async () => {
      throw new DOMException("counter unavailable", "QuotaExceededError");
    };
    root.entries.set(sequence.name, sequence);
    const h = await worker(root);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await h.enumerate();
    const b = fileAt(root, "b.sd")!;
    const getFile = b.getFile.bind(b);
    let reached = false;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    b.getFile = async () => {
      if (b.history.length === 0) {
        return getFile();
      }
      reached = true;
      await held;
      return getFile();
    };
    h.start("batch", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("a.sd", 0, "!"), insert("b.sd", 0, "!")] },
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(reached).toBe(true);
    await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "NEW", "editor"));
    expect(h.writtenTexts("a.sd").at(-1)).toBe("NEW");
    const before = h.messages.length;
    release();
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("batch")).toMatchObject({ result: { applied: true } });
    expect(h.writtenTexts("a.sd", before)).toEqual([]);
    expect((await h.cached("a.sd")).text).toBe("NEW");
    expect(textAt(root, "a.sd")).toBe("NEW");
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

  it("refuses a rename onto an occupied file without either option and touches neither file", async () => {
    const root = seed({ "a.txt": [1, 1], "b.txt": [2, 2] });
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [{ oldUri: uriOf("a.txt"), newUri: uriOf("b.txt") }],
      }),
    ).toHaveProperty("error");
    expect([...fileAt(root, "a.txt")!.bytes]).toEqual([1, 1]);
    expect([...fileAt(root, "b.txt")!.bytes]).toEqual([2, 2]);
    expect(h.notifications("workspace/didRenameFiles")).toEqual([]);
  });

  it("replaces an occupied file when the rename asks to overwrite", async () => {
    const root = seed({ "a.txt": [1, 1], "b.txt": [2, 2] });
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [{ oldUri: uriOf("a.txt"), newUri: uriOf("b.txt"), options: { overwrite: true } }],
      }),
    ).toHaveProperty("result");
    expect(fileAt(root, "a.txt")).toBeUndefined();
    expect([...fileAt(root, "b.txt")!.bytes]).toEqual([1, 1]);
  });

  it("skips a rename onto an occupied file when the rename asks to ignore it", async () => {
    const root = seed({ "a.txt": [1, 1], "b.txt": [2, 2] });
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [{ oldUri: uriOf("a.txt"), newUri: uriOf("b.txt"), options: { ignoreIfExists: true } }],
      }),
    ).toHaveProperty("result");
    expect([...fileAt(root, "a.txt")!.bytes]).toEqual([1, 1]);
    expect([...fileAt(root, "b.txt")!.bytes]).toEqual([2, 2]);
    expect(h.notifications("workspace/didRenameFiles")).toEqual([]);
  });

  it("refuses only the occupied entry of a batch and moves the rest", async () => {
    const root = seed({ "a.txt": [1], "b.txt": [2], "c.txt": [3] });
    const h = await worker(root);
    expect(
      await h.request("rename", "workspace/willRenameFiles", {
        files: [
          { oldUri: uriOf("a.txt"), newUri: uriOf("b.txt") },
          { oldUri: uriOf("c.txt"), newUri: uriOf("d.txt") },
        ],
      }),
    ).toHaveProperty("error");
    expect(listMemory(root, "local")).toEqual(["a.txt", "b.txt", "d.txt"]);
    expect([...fileAt(root, "b.txt")!.bytes]).toEqual([2]);
    expect(h.notifications("workspace/didRenameFiles").map((m) => m.params.files)).toEqual([
      [{ oldUri: uriOf("c.txt"), newUri: uriOf("d.txt") }],
    ]);
  });

  it("reports an edit's refused rename onto an occupied file as not applied", async () => {
    const root = seed({ "a.txt": [1], "b.txt": [2] });
    const h = await worker(root);
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", {
        edit: { documentChanges: [{ kind: "rename", oldUri: uriOf("a.txt"), newUri: uriOf("b.txt") }] },
      }),
    ).toMatchObject({ result: { applied: false } });
    expect([...fileAt(root, "a.txt")!.bytes]).toEqual([1]);
    expect([...fileAt(root, "b.txt")!.bytes]).toEqual([2]);
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
      files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("b.sd"), options: { overwrite: true } }],
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
        files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("b.sd"), options: { overwrite: true } }],
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
        files: [{ oldUri: uriOf("a.sd"), newUri: uriOf("b.sd"), options: { overwrite: true } }],
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

describe("applying a workspace edit whole or not at all (I-2070)", () => {
  const projectDirectory = (root: MemoryDirectory) =>
    root.entries.get("local") as MemoryDirectory;

  const failRemoving = (directory: MemoryDirectory, name: string) => {
    const remove = directory.removeEntry.bind(directory);
    directory.removeEntry = async (entry, options) => {
      if (entry === name) {
        throw new DOMException(`${name} is locked`, "NoModificationAllowedError");
      }
      return remove(entry, options);
    };
  };

  const failCreating = (directory: MemoryDirectory, name: string) => {
    const get = directory.getFileHandle.bind(directory);
    directory.getFileHandle = async (entry, options = {}) => {
      if (entry === name && options.create && !directory.entries.has(entry)) {
        throw new DOMException(`${name} cannot be created`, "QuotaExceededError");
      }
      return get(entry, options);
    };
  };

  const failWrite = (file: MemoryFile, ...nth: number[]) => {
    const access = file.createSyncAccessHandle.bind(file);
    let writes = 0;
    file.createSyncAccessHandle = async () => {
      const handle = await access();
      return {
        ...handle,
        write: (data: DataView | Uint8Array) => {
          writes += 1;
          if (nth.includes(writes)) {
            throw new DOMException("disk full", "QuotaExceededError");
          }
          return handle.write(data);
        },
      };
    };
  };

  const referenceRename = (from: string, to: string) => ({
    documentChanges: [
      {
        textDocument: { uri: uriOf("main.sd"), version: null },
        edits: [
          {
            range: { start: { line: 0, character: 4 }, end: { line: 0, character: 5 } },
            newText: "b",
          },
        ],
      },
      { kind: "rename", oldUri: uriOf(from), newUri: uriOf(to) },
    ],
  });

  it("applies a reference edit and the rename it belongs to", async () => {
    const root = seed({ "main.sd": "see a", "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    expect(
      await h.request("edit", "workspace/applyWorkspaceEdit", { edit: referenceRename("a.sd", "b.sd") }),
    ).toMatchObject({ result: { applied: true } });
    expect(listMemory(root, "local")).toEqual(["b.sd", "main.sd"]);
    expect(textAt(root, "main.sd")).toBe("see b");
    expect(textAt(root, "b.sd")).toBe("A");
  });

  it("restores the reference edit when the rename after it fails, and reports which change failed", async () => {
    const root = seed({ "main.sd": "see a", "a.sd": "A" });
    failRemoving(projectDirectory(root), "a.sd");
    const h = await worker(root);
    await h.enumerate();
    const from = h.messages.length;
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: referenceRename("a.sd", "b.sd"),
    });
    expect(response.result).toMatchObject({
      applied: false,
      failedChange: 1,
      rollback: { complete: true, failed: [], kept: [] },
    });
    expect(response.result.failureReason).toContain("a.sd is locked");
    expect(listMemory(root, "local")).toEqual(["a.sd", "main.sd"]);
    expect(textAt(root, "main.sd")).toBe("see a");
    expect(textAt(root, "a.sd")).toBe("A");
    expect(h.writtenTexts("main.sd", from)).toEqual(["see a"]);
    expect(h.notifications("workspace/didRenameFiles", from)).toEqual([]);
    expect(h.notifications("workspace/didCreateFiles", from)).toEqual([]);
    expect((await h.cached("main.sd")).text).toBe("see a");
    expect(await h.cached("b.sd")).toBeUndefined();
  });

  it("names the files left changed when restoring an earlier change fails", async () => {
    const root = seed({ "main.sd": "see a", "a.sd": "A" });
    failRemoving(projectDirectory(root), "a.sd");
    failWrite(fileAt(root, "main.sd")!, 2);
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: referenceRename("a.sd", "b.sd"),
    });
    expect(response.result).toMatchObject({ applied: false, failedChange: 1 });
    expect(response.result.failureReason).toContain("a.sd is locked");
    expect(response.result.failureReason).toContain("partly applied");
    expect(response.result.failureReason).toContain(uriOf("main.sd"));
    expect(response.result.failureReason).toContain(uriOf("b.sd"));
    expect(response.result.rollback).toEqual({
      complete: false,
      failed: [uriOf("main.sd"), uriOf("b.sd")],
      kept: [],
      trashed: [uriOf("main.sd")],
    });
    expect(inTrash(root)).toEqual({ "main.sd": "see b" });
    expect(textAt(root, "main.sd")).toBe("see b");
    expect(listMemory(root, "local").filter((path) => !path.startsWith(".trash/"))).toEqual([
      "a.sd",
      "b.sd",
      "main.sd",
    ]);
  });

  it("announces what storage holds, not the edit's text, for a file whose restore failed", async () => {
    const root = seed({ "main.sd": "see a", "a.sd": "A" });
    failRemoving(projectDirectory(root), "a.sd");
    failWrite(fileAt(root, "main.sd")!, 2, 3);
    const h = await worker(root);
    await h.enumerate();
    const from = h.messages.length;
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: referenceRename("a.sd", "b.sd"),
    });
    expect(response.result.failureReason).toContain(uriOf("main.sd"));
    expect(textAt(root, "main.sd")).toBe("");
    expect(h.writtenTexts("main.sd", from)).not.toContain("see b");
    expect((await h.cached("main.sd")).text).toBe("");
  });

  it("keeps a renamed file's only copy when its original cannot be recreated", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "ONLY COPY" });
    failCreating(projectDirectory(root), "a.sd");
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result).toMatchObject({ applied: false, failedChange: 1 });
    expect(response.result.failureReason).toContain("partly applied");
    expect(response.result.failureReason).toContain(uriOf("a.sd"));
    expect(response.result.failureReason).toContain(uriOf("b.sd"));
    expect(response.result.rollback).toEqual({
      complete: false,
      failed: [uriOf("a.sd"), uriOf("b.sd")],
      kept: [],
    });
    expect(textAt(root, "b.sd")).toBe("ONLY COPY");
  });

  it("keeps the only copy of a file renamed twice when its original cannot be recreated", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "ONLY COPY" });
    failCreating(projectDirectory(root), "a.sd");
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") },
          { kind: "rename", oldUri: uriOf("b.sd"), newUri: uriOf("c.sd") },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result).toMatchObject({ applied: false, failedChange: 2 });
    expect(response.result.rollback).toEqual({
      complete: false,
      failed: [uriOf("a.sd"), uriOf("c.sd")],
      kept: [],
    });
    expect(textAt(root, "c.sd")).toBe("ONLY COPY");
  });

  it("does not restore an overwritten rename target over the only copy of the renamed file", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "ONLY COPY", "b.sd": "OLD TARGET" });
    failCreating(projectDirectory(root), "a.sd");
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd"), options: { overwrite: true } },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result.rollback).toEqual({
      complete: false,
      failed: [uriOf("a.sd"), uriOf("b.sd")],
      kept: [],
    });
    expect(textAt(root, "b.sd")).toBe("ONLY COPY");
  });

  it("keeps an edited copy of a renamed file when its original cannot be recreated", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "ONLY COPY" });
    failCreating(projectDirectory(root), "a.sd");
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") },
          insert("b.sd", 9, "!"),
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result.rollback).toEqual({
      complete: false,
      failed: [uriOf("a.sd"), uriOf("b.sd")],
      kept: [],
    });
    expect(textAt(root, "b.sd")).toBe("ONLY COPY!");
  });

  it("undoes a swap made of three renames", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "A", "b.sd": "B" });
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("tmp.sd") },
          { kind: "rename", oldUri: uriOf("b.sd"), newUri: uriOf("a.sd") },
          { kind: "rename", oldUri: uriOf("tmp.sd"), newUri: uriOf("b.sd") },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result).toMatchObject({
      applied: false,
      failedChange: 3,
      rollback: { complete: true, failed: [], kept: [] },
    });
    expect(listMemory(root, "local")).toEqual(["a.sd", "b.sd", "main.sd"]);
    expect(textAt(root, "a.sd")).toBe("A");
    expect(textAt(root, "b.sd")).toBe("B");
  });

  it("puts back an overwritten rename target once the renamed file is restored", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "MOVED", "b.sd": "OLD TARGET" });
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd"), options: { overwrite: true } },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result.rollback).toEqual({ complete: true, failed: [], kept: [] });
    expect(textAt(root, "a.sd")).toBe("MOVED");
    expect(textAt(root, "b.sd")).toBe("OLD TARGET");
  });

  const holdRead = (file: MemoryFile, when: () => boolean) => {
    const getFile = file.getFile.bind(file);
    let release!: () => void;
    let reached = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    file.getFile = async () => {
      if (!reached && when()) {
        reached = true;
        await held;
      }
      return getFile();
    };
    return { reached: () => reached, release };
  };

  const editThenFail = {
    edit: {
      documentChanges: [
        insert("a.sd", 1, "!"),
        insert("b.sd", 1, "!"),
        insert("missing.sd", 0, "x"),
      ],
    },
  };

  const keptA = {
    complete: false,
    failed: [],
    kept: [uriOf("a.sd")],
    trashed: [uriOf("b.sd")],
  };

  const inTrash = (root: MemoryDirectory) => {
    const files = listMemory(root, "local/.trash").filter((path) => !path.endsWith("/"));
    const batches = new Set(files.map((path) => path.split("/")[0]));
    expect(batches.size).toBeLessThanOrEqual(1);
    if (files.length > 0) {
      expect(files.some((path) => path.endsWith("/__manifest.json"))).toBe(true);
    }
    return Object.fromEntries(
      files
        .filter((path) => !path.endsWith("/__manifest.json"))
        .map((path) => [path.split("/").slice(1).join("/"), textAt(root, `.trash/${path}`)]),
    );
  };

  it("keeps a save that lands on an edited file while the edit is still running", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    const h = await worker(root);
    await h.enumerate();
    let release!: () => void;
    fileAt(root, "b.sd")!.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.start("edit", "workspace/applyWorkspaceEdit", editThenFail);
    await vi.advanceTimersByTimeAsync(250);
    expect(textAt(root, "a.sd")).toBe("A!");
    expect(
      await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "SAVED", "editor")),
    ).toMatchObject({ result: [{ text: "SAVED" }] });
    fileAt(root, "b.sd")!.gate = undefined;
    release();
    await vi.advanceTimersByTimeAsync(250);
    const response = h.response("edit");
    expect(response.result).toMatchObject({ applied: false, failedChange: 2, rollback: keptA });
    expect(response.result.failureReason).toContain("partly applied");
    expect(textAt(root, "a.sd")).toBe("SAVED");
    expect(textAt(root, "b.sd")).toBe("B");
  });

  it("keeps a save that lands between an edit's snapshot of a file and its write", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    const a = fileAt(root, "a.sd")!;
    const h = await worker(root);
    await h.enumerate();
    const hold = holdRead(a, () => a.history.length === 0);
    h.start("edit", "workspace/applyWorkspaceEdit", editThenFail);
    await vi.advanceTimersByTimeAsync(250);
    expect(hold.reached()).toBe(true);
    h.start("save", "workspace/willWriteFiles", writeOf("a.sd", "SAVED", "editor"));
    await vi.advanceTimersByTimeAsync(250);
    hold.release();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.response("save")).toMatchObject({ result: [{ text: "SAVED" }] });
    expect(h.response("edit").result.rollback).toEqual(keptA);
    expect(a.history.map((bytes) => dec.decode(bytes))).toEqual(["SAVED", "S!AVED"]);
    expect(textAt(root, "b.sd")).toBe("B");
  });

  it("keeps a save that lands while the rollback is restoring another file", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    const b = fileAt(root, "b.sd")!;
    const h = await worker(root);
    await h.enumerate();
    const hold = holdRead(b, () => b.history.length > 0);
    h.start("edit", "workspace/applyWorkspaceEdit", editThenFail);
    await vi.advanceTimersByTimeAsync(500);
    expect(hold.reached()).toBe(true);
    expect(
      await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "SAVED", "editor")),
    ).toMatchObject({ result: [{ text: "SAVED" }] });
    hold.release();
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("edit").result.rollback).toEqual(keptA);
    expect(textAt(root, "a.sd")).toBe("SAVED");
    expect(textAt(root, "b.sd")).toBe("B");
  });

  for (const [title, saved] of [
    ["keeps a save that lands between the rollback's look at a file and its restore", "SAVED"],
    ["keeps a save of the edit's own text that lands between the rollback's look at a file and its restore", "A!"],
  ] as const) {
    it(title, async () => {
      const root = seed({ "a.sd": "A", "b.sd": "B" });
      const a = fileAt(root, "a.sd")!;
      const h = await worker(root);
      await h.enumerate();
      const hold = holdRead(a, () => a.history.length > 0);
      h.start("edit", "workspace/applyWorkspaceEdit", editThenFail);
      await vi.advanceTimersByTimeAsync(500);
      expect(hold.reached()).toBe(true);
      h.start("save", "workspace/willWriteFiles", writeOf("a.sd", saved, "editor"));
      await vi.advanceTimersByTimeAsync(250);
      hold.release();
      await vi.advanceTimersByTimeAsync(250);
      expect(h.response("save")).toMatchObject({ result: [{ text: saved }] });
      expect(h.response("edit").result.rollback).toEqual(keptA);
      expect(textAt(root, "a.sd")).toBe(saved);
    });
  }

  it("keeps the other half of a swap when a save lands on one half during the rollback", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "ORIGINAL-A", "b.sd": "ORIGINAL-B" });
    const original = fileAt(root, "b.sd")!;
    const project = projectDirectory(root);
    const h = await worker(root);
    await h.enumerate();
    let hold = { reached: () => false, release: () => {} };
    const get = project.getFileHandle.bind(project);
    project.getFileHandle = async (name, options) => {
      const handle = await get(name, options);
      if (name === "b.sd" && handle !== original && !hold.reached() && handle.history.length > 0) {
        hold = holdRead(handle, () => true);
      }
      return handle;
    };
    h.start("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("tmp.sd") },
          { kind: "rename", oldUri: uriOf("b.sd"), newUri: uriOf("a.sd") },
          { kind: "rename", oldUri: uriOf("tmp.sd"), newUri: uriOf("b.sd") },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(hold.reached()).toBe(true);
    h.start("save", "workspace/willWriteFiles", writeOf("b.sd", "ORIGINAL-A", "editor"));
    await vi.advanceTimersByTimeAsync(250);
    hold.release();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.response("edit").result.rollback).toEqual({
      complete: false,
      failed: [],
      kept: [uriOf("b.sd")],
      trashed: [uriOf("a.sd")],
    });
    expect(textAt(root, "a.sd")).toBe("ORIGINAL-A");
    expect(textAt(root, "b.sd")).toBe("ORIGINAL-A");
    expect(inTrash(root)).toEqual({ "a.sd": "ORIGINAL-B" });
  });

  const holdNthRead = (file: MemoryFile, nth: number) => {
    let reads = 0;
    return holdRead(file, () => file.history.length > 0 && ++reads === nth);
  };

  it("keeps a copy of an overwritten target when a save lands on the recreated source later in the rollback", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "ORIGINAL-A", "b.sd": "ORIGINAL-B" });
    const b = fileAt(root, "b.sd")!;
    const h = await worker(root);
    await h.enumerate();
    const hold = holdNthRead(b, 2);
    h.start("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd"), options: { overwrite: true } },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(hold.reached()).toBe(true);
    expect(
      await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "SAVED", "editor")),
    ).toMatchObject({ result: [{ text: "SAVED" }] });
    hold.release();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.response("edit").result.rollback).toEqual({
      complete: false,
      failed: [],
      kept: [uriOf("a.sd")],
      trashed: [uriOf("b.sd")],
    });
    expect(textAt(root, "a.sd")).toBe("SAVED");
    expect(textAt(root, "b.sd")).toBe("ORIGINAL-B");
    expect(inTrash(root)).toEqual({ "b.sd": "ORIGINAL-A" });
  });

  it("keeps the rollback's copies when one of them is written while the rollback runs", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "A", "b.sd": "B" });
    const project = projectDirectory(root);
    const h = await worker(root);
    await h.enumerate();
    let hold: { reached: () => boolean; release: () => void } | undefined;
    const get = project.getFileHandle.bind(project);
    project.getFileHandle = async (name, options) => {
      const handle = await get(name, options);
      if (name === "a.sd" && handle.history.length > 0 && !hold) {
        hold = holdNthRead(handle, 2);
      }
      return handle;
    };
    h.start("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("tmp.sd") },
          { kind: "rename", oldUri: uriOf("b.sd"), newUri: uriOf("a.sd") },
          { kind: "rename", oldUri: uriOf("tmp.sd"), newUri: uriOf("b.sd") },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(hold?.reached()).toBe(true);
    const [copy] = listMemory(root, "local/.trash").filter((path) => path.endsWith("/b.sd"));
    expect(copy).toBeDefined();
    expect(
      await h.request("save", "workspace/willWriteFiles", writeOf(`.trash/${copy}`, "SAVED-COPY", "editor")),
    ).toHaveProperty("result");
    hold!.release();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.response("edit").result.rollback).toEqual({
      complete: false,
      failed: [],
      kept: [],
      trashed: [uriOf("b.sd"), uriOf("a.sd")],
    });
    expect(textAt(root, "a.sd")).toBe("A");
    expect(textAt(root, "b.sd")).toBe("B");
    expect(inTrash(root)).toEqual({ "b.sd": "SAVED-COPY", "a.sd": "B" });
  });

  it("keeps a copy of an edited rename target when a save lands on its source while the edit runs", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "ORIGINAL-A", "b.sd": "ORIGINAL-B", "c.sd": "C" });
    const h = await worker(root);
    await h.enumerate();
    let release!: () => void;
    fileAt(root, "c.sd")!.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.start("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd"), options: { overwrite: true } },
          insert("b.sd", 0, "!"),
          insert("c.sd", 1, "!"),
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(
      await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "SAVED", "editor")),
    ).toMatchObject({ result: [{ text: "SAVED" }] });
    fileAt(root, "c.sd")!.gate = undefined;
    release();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.response("edit").result.rollback).toEqual({
      complete: false,
      failed: [],
      kept: [uriOf("a.sd")],
      trashed: [uriOf("c.sd"), uriOf("b.sd")],
    });
    expect(textAt(root, "a.sd")).toBe("SAVED");
    expect(textAt(root, "b.sd")).toBe("ORIGINAL-B");
    expect(textAt(root, "c.sd")).toBe("C");
    expect(inTrash(root)).toEqual({ "b.sd": "!ORIGINAL-A", "c.sd": "C!" });
  });

  const renameOver = {
    edit: {
      documentChanges: [
        { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd"), options: { overwrite: true } },
        insert("missing.sd", 0, "x"),
      ],
    },
  };

  it("keeps the copy of a file whose restore write failed after it started", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "ORIGINAL-A", "b.sd": "ORIGINAL-B" });
    failWrite(fileAt(root, "b.sd")!, 2, 3);
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", renameOver);
    expect(response.result.rollback).toEqual({
      complete: false,
      failed: [uriOf("b.sd")],
      kept: [],
      trashed: [uriOf("b.sd")],
    });
    expect(inTrash(root)).toEqual({ "b.sd": "ORIGINAL-A" });
  });

  it("reports a save that lands while the rollback cleans up its copies", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "ORIGINAL-A", "b.sd": "ORIGINAL-B" });
    const original = fileAt(root, "b.sd")!;
    const getFile = MemoryFile.prototype.getFile;
    let release!: () => void;
    let reached = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(MemoryFile.prototype, "getFile").mockImplementation(async function (this: MemoryFile) {
      if (!reached && this.name === "b.sd" && this !== original) {
        reached = true;
        await held;
      }
      return getFile.call(this);
    });
    const h = await worker(root);
    await h.enumerate();
    h.start("edit", "workspace/applyWorkspaceEdit", renameOver);
    await vi.advanceTimersByTimeAsync(500);
    expect(reached).toBe(true);
    expect(
      await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "SAVED-LATE", "editor")),
    ).toMatchObject({ result: [{ text: "SAVED-LATE" }] });
    release();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.response("edit").result.rollback).toMatchObject({
      complete: false,
      failed: [],
      kept: [uriOf("a.sd")],
    });
    expect(textAt(root, "a.sd")).toBe("SAVED-LATE");
    expect(textAt(root, "b.sd")).toBe("ORIGINAL-B");
  });

  it("answers with the rollback's outcome when its Trash manifest cannot be written", async () => {
    const root = seed({ "a.sd": "A", "b.sd": "B" });
    const get = MemoryDirectory.prototype.getFileHandle;
    vi.spyOn(MemoryDirectory.prototype, "getFileHandle").mockImplementation(async function (
      this: MemoryDirectory,
      name: string,
      options: { create?: boolean } = {},
    ) {
      if (name === "__manifest.json" && options.create) {
        throw new DOMException("manifest quota", "QuotaExceededError");
      }
      return get.call(this, name, options);
    });
    const h = await worker(root);
    await h.enumerate();
    let release!: () => void;
    fileAt(root, "b.sd")!.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    h.start("edit", "workspace/applyWorkspaceEdit", editThenFail);
    await vi.advanceTimersByTimeAsync(250);
    await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "SAVED", "editor"));
    fileAt(root, "b.sd")!.gate = undefined;
    release();
    await vi.advanceTimersByTimeAsync(500);
    const result = h.response("edit").result;
    expect(result).toMatchObject({ applied: false, failedChange: 2 });
    expect(result.rollback).toEqual({
      complete: false,
      failed: [expect.stringMatching(/^file:\/\/local\/\.trash\/[^/]+\/b\.sd$/)],
      kept: [uriOf("a.sd")],
    });
    expect(result.failureReason).toContain("could not be listed in the Trash");
    expect(textAt(root, "b.sd")).toBe("B");
    const listed = await h.request("list", "workspace/trashFiles", { projectId: "local", action: "list" });
    expect(listed.result.batches).toEqual([]);
    expect(textAt(root, result.rollback.failed[0].replace("file://local/", ""))).toBe("B!");
  });

  it("reports a save that lands while the rollback removes a folder the edit made", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "A" });
    const project = projectDirectory(root);
    const remove = project.removeEntry.bind(project);
    let release!: () => void;
    let reached = false;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    project.removeEntry = async (entry, options) => {
      if (entry === "new" && !reached) {
        reached = true;
        await held;
      }
      return remove(entry, options);
    };
    const h = await worker(root);
    await h.enumerate();
    h.start("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("new/b.sd") },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(reached).toBe(true);
    expect(
      await h.request("save", "workspace/willWriteFiles", writeOf("a.sd", "SAVED", "editor")),
    ).toMatchObject({ result: [{ text: "SAVED" }] });
    release();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.response("edit").result.rollback).toMatchObject({
      complete: false,
      failed: [],
      kept: [uriOf("a.sd")],
    });
    expect(textAt(root, "a.sd")).toBe("SAVED");
  });

  it("keeps a file another tab writes between the rollback's look at it and its restore, and removes nothing after", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "A", "b.sd": "B" });
    const a = fileAt(root, "a.sd")!;
    const getFile = a.getFile.bind(a);
    let reads = 0;
    a.getFile = async () => {
      if (a.history.length > 0 && ++reads === 2) {
        a.bytes = enc.encode("OTHER TAB");
      }
      return getFile();
    };
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          insert("a.sd", 1, "!"),
          { kind: "create", uri: uriOf("new.sd"), data: enc.encode("NEW").buffer },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result.rollback).toEqual({
      complete: false,
      failed: [uriOf("new.sd")],
      kept: [uriOf("a.sd")],
    });
    expect(textAt(root, "a.sd")).toBe("OTHER TAB");
    expect(textAt(root, "new.sd")).toBe("NEW");
  });

  it("brings back an empty folder an earlier change deleted", async () => {
    const root = seed({ "main.sd": "M" }, ["kept"]);
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "delete", uri: uriOf("kept") },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result).toMatchObject({
      applied: false,
      failedChange: 1,
      rollback: { complete: true, failed: [], kept: [] },
    });
    expect(listMemory(root, "local")).toEqual(["kept/", "main.sd"]);
  });

  it("brings back a file an earlier change deleted", async () => {
    const root = seed({ "main.sd": "M", "old.png": [1, 2, 3] });
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "delete", uri: uriOf("old.png") },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result).toMatchObject({ applied: false, failedChange: 1 });
    expect(listMemory(root, "local")).toEqual(["main.sd", "old.png"]);
    expect([...fileAt(root, "old.png")!.bytes]).toEqual([1, 2, 3]);
    expect(await h.cached("old.png")).toBeDefined();
  });

  it("removes a file an earlier change created and the folder made for it", async () => {
    const root = seed({ "main.sd": "M" });
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "create", uri: uriOf("new/made.sd"), data: enc.encode("NEW").buffer },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result).toMatchObject({ applied: false, failedChange: 1 });
    expect(listMemory(root, "local")).toEqual(["main.sd"]);
    expect(await h.cached("new/made.sd")).toBeUndefined();
  });

  it("moves a renamed file back out of the folder made for it", async () => {
    const root = seed({ "main.sd": "M", "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("moved/a.sd") },
          insert("missing.sd", 0, "x"),
        ],
      },
    });
    expect(response.result).toMatchObject({ applied: false, failedChange: 1 });
    expect(listMemory(root, "local")).toEqual(["a.sd", "main.sd"]);
    expect(textAt(root, "a.sd")).toBe("A");
  });

  it("reports a refused first change as nothing applied, with nothing to roll back", async () => {
    const root = seed({ "main.sd": "M" });
    const h = await worker(root);
    await h.enumerate();
    const from = h.messages.length;
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("missing.sd", 0, "x"), insert("main.sd", 0, "x")] },
    });
    expect(response.result).toMatchObject({
      applied: false,
      failedChange: 0,
      rollback: { complete: true, failed: [], kept: [] },
    });
    expect(textAt(root, "main.sd")).toBe("M");
    expect(h.writtenTexts("main.sd", from)).toEqual([]);
  });

  it("restores the earlier files of an edit given as changes by file", async () => {
    const root = seed({ "main.sd": "M" });
    const h = await worker(root);
    await h.enumerate();
    const edits = [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "x" }];
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: { changes: { [uriOf("main.sd")]: edits, [uriOf("missing.sd")]: edits } },
    });
    expect(response.result).toMatchObject({ applied: false, failedChange: 1 });
    expect(textAt(root, "main.sd")).toBe("M");
  });
});

describe("an edit an open editor finishes after the worker has applied the rest (I-2100)", () => {
  const rest = {
    documentChanges: [
      insert("chapter.sd", 0, "x"),
      { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") },
    ],
  };

  const asks = (h: Awaited<ReturnType<typeof worker>>) =>
    h.messages.filter((m) => m.method === "workspace/confirmWorkspaceEdit" && "id" in m);

  const answer = (id: unknown, result: unknown) =>
    void (globalThis as any).onmessage({
      data: { jsonrpc: "2.0", method: "workspace/confirmWorkspaceEdit", id, result },
    });

  it("asks before it answers, and announces nothing until the editor has applied its part", async () => {
    const root = seed({ "chapter.sd": "C", "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const from = h.messages.length;
    h.start("edit", "workspace/applyWorkspaceEdit", { edit: rest, confirm: true });
    await vi.advanceTimersByTimeAsync(250);
    const [ask] = asks(h);
    expect(ask?.params).toEqual({ edit: "edit" });
    expect(h.response("edit")).toBeUndefined();
    expect(h.notifications("workspace/didRenameFiles", from)).toEqual([]);
    expect(h.writtenTexts("chapter.sd", from)).toEqual([]);
    answer(ask.id, {});
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("edit").result).toEqual({ applied: true });
    expect(listMemory(root, "local")).toEqual(["b.sd", "chapter.sd"]);
    expect(textAt(root, "chapter.sd")).toBe("xC");
  });

  it("rolls the rest back and reports the editor's refusal when the editor refuses its part", async () => {
    const root = seed({ "chapter.sd": "C", "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const from = h.messages.length;
    h.start("edit", "workspace/applyWorkspaceEdit", { edit: rest, confirm: true });
    await vi.advanceTimersByTimeAsync(250);
    const [ask] = asks(h);
    answer(ask.id, { refusal: "main.sd changed before the edit could be applied" });
    await vi.advanceTimersByTimeAsync(250);
    expect(h.response("edit").result).toEqual({
      applied: false,
      failureReason: "main.sd changed before the edit could be applied",
      rollback: { complete: true, failed: [], kept: [] },
    });
    expect(listMemory(root, "local")).toEqual(["a.sd", "chapter.sd"]);
    expect(textAt(root, "chapter.sd")).toBe("C");
    expect(textAt(root, "a.sd")).toBe("A");
    expect(h.notifications("workspace/didRenameFiles", from)).toEqual([]);
    expect((await h.cached("chapter.sd")).text).toBe("C");
    expect(await h.cached("b.sd")).toBeUndefined();
  });

  it("does not ask when the rest fails on its own", async () => {
    const root = seed({ "chapter.sd": "C", "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const response = await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("chapter.sd", 0, "x"), insert("missing.sd", 0, "x")] },
      confirm: true,
    });
    expect(response.result).toMatchObject({ applied: false, failedChange: 1 });
    expect(asks(h)).toEqual([]);
    expect(textAt(root, "chapter.sd")).toBe("C");
  });
});

describe("the announcement of a rollback's restoring write (I-2100)", () => {
  const restoredIn = (h: Awaited<ReturnType<typeof worker>>, from: number) =>
    h.notifications("workspace/didWriteFiles", from).map((m) => ({
      texts: m.params.files.map((f: any) => [f.uri, f.text]),
      restored: m.params.restored,
    }));

  it("names the file a refused edit's rollback restored", async () => {
    const root = seed({ "chapter.sd": "C", "a.sd": "A" });
    const h = await worker(root);
    await h.enumerate();
    const from = h.messages.length;
    h.start("edit", "workspace/applyWorkspaceEdit", {
      edit: {
        documentChanges: [
          insert("chapter.sd", 0, "x"),
          { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") },
        ],
      },
      confirm: true,
    });
    await vi.advanceTimersByTimeAsync(250);
    const ask = h.messages.find((m) => m.method === "workspace/confirmWorkspaceEdit" && "id" in m);
    void (globalThis as any).onmessage({
      data: { jsonrpc: "2.0", method: "workspace/confirmWorkspaceEdit", id: ask.id, result: { refusal: "no" } },
    });
    await vi.advanceTimersByTimeAsync(250);
    expect(restoredIn(h, from)).toContainEqual({
      texts: [
        [uriOf("chapter.sd"), "C"],
        [uriOf("a.sd"), "A"],
      ],
      restored: [uriOf("chapter.sd"), uriOf("a.sd")],
    });
  });

  it("names the file restored after a later change of the edit failed", async () => {
    const root = seed({ "main.sd": "M" });
    const h = await worker(root);
    await h.enumerate();
    const from = h.messages.length;
    await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("main.sd", 0, "x"), insert("missing.sd", 0, "x")] },
    });
    expect(restoredIn(h, from)).toContainEqual({
      texts: [[uriOf("main.sd"), "M"]],
      restored: [uriOf("main.sd")],
    });
  });

  it("names the restored file when the shared sequence cannot be written", async () => {
    const root = seed({ "main.sd": "M" });
    const sequence = new MemoryFile(".opfs-workspace-sequence");
    sequence.createSyncAccessHandle = async () => {
      throw new DOMException("sequence storage unavailable", "QuotaExceededError");
    };
    root.entries.set(sequence.name, sequence);
    const h = await worker(root);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await h.enumerate();
    const from = h.messages.length;
    await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("main.sd", 0, "x"), insert("missing.sd", 0, "x")] },
    });
    const announced = restoredIn(h, from).filter((a) =>
      a.texts.some(([uri]: string[]) => uri === uriOf("main.sd")),
    );
    expect(announced.length).toBeGreaterThan(0);
    expect(announced.at(-1)).toEqual({
      texts: [[uriOf("main.sd"), "M"]],
      restored: [uriOf("main.sd")],
    });
  });

  it("keeps another tab's restored marking on an unsequenced announcement only while storage holds the restored text", async () => {
    const root = seed({ "main.sd": "M", "other.sd": "O" });
    const h = await worker(root);
    await h.enumerate();
    const from = h.messages.length;
    writeMemoryFile(root, "local/other.sd", enc.encode("SAVED SINCE"));
    await h.remote("workspace/didWriteFiles", {
      files: [fileData("main.sd", "M"), fileData("other.sd", "O")],
      restored: [uriOf("main.sd"), uriOf("other.sd")],
    });
    const announced = restoredIn(h, from);
    expect(announced).toContainEqual({
      texts: [
        [uriOf("main.sd"), "M"],
        [uriOf("other.sd"), "SAVED SINCE"],
      ],
      restored: [uriOf("main.sd")],
    });
  });

  it("names nothing when the edit applies, nor for an ordinary save", async () => {
    const root = seed({ "main.sd": "M" });
    const h = await worker(root);
    await h.enumerate();
    const from = h.messages.length;
    await h.request("edit", "workspace/applyWorkspaceEdit", {
      edit: { documentChanges: [insert("main.sd", 0, "x")] },
    });
    await h.request("save", "workspace/willWriteFiles", writeOf("main.sd", "saved"));
    const announced = restoredIn(h, from);
    expect(announced.length).toBeGreaterThan(0);
    expect(announced.every((a) => a.restored === undefined)).toBe(true);
  });
});

describe("the schedule matrix of a refused edit and the author's typing (I-2100)", () => {
  type Ownership = "held" | "opened" | "two editors";
  type Sequence = "stamped" | "unsequenced";
  type Tab = "this tab" | "a second tab";

  const OWNERSHIPS: Ownership[] = ["held", "opened", "two editors"];
  const SEQUENCES: Sequence[] = ["stamped", "unsequenced"];

  const PRE: Record<string, string> = { "main.sd": "M", "chapter.sd": "C", "a.sd": "A" };
  const TYPED: Record<string, string> = { "main.sd": "M typed", "chapter.sd": "C typed" };
  const TYPED_IN_SECOND_TAB = "C typed in the second tab";

  const typedScripts = (ownership: Ownership) =>
    ownership === "held"
      ? ["main.sd"]
      : ownership === "opened"
        ? ["chapter.sd"]
        : ["main.sd", "chapter.sd"];

  const editorOrigin = (path: string) => `editor:${path}`;

  const rest = {
    documentChanges: [
      insert("chapter.sd", 0, "x"),
      { kind: "rename", oldUri: uriOf("a.sd"), newUri: uriOf("b.sd") },
    ],
  };

  const storageSteps = () => {
    const state = { armed: false, count: 0, pauseAt: 0, paused: false, release: () => {} };
    const patched: [any, string, any][] = [];
    const wrap = (proto: any, name: string) => {
      const original = proto[name];
      patched.push([proto, name, original]);
      proto[name] = async function (this: unknown, ...args: unknown[]) {
        if (state.armed) {
          state.count += 1;
          if (state.count === state.pauseAt) {
            state.paused = true;
            await new Promise<void>((resolve) => {
              state.release = resolve;
            });
          }
        }
        return original.apply(this, args);
      };
    };
    wrap(MemoryFile.prototype, "getFile");
    wrap(MemoryFile.prototype, "createSyncAccessHandle");
    wrap(MemoryDirectory.prototype, "getFileHandle");
    wrap(MemoryDirectory.prototype, "getDirectoryHandle");
    wrap(MemoryDirectory.prototype, "removeEntry");
    const restore = () =>
      patched.forEach(([proto, name, original]) => {
        proto[name] = original;
      });
    return { state, restore };
  };

  const seedFor = (sequence: Sequence) => {
    const root = seed(PRE);
    if (sequence === "unsequenced") {
      const file = new MemoryFile(".opfs-workspace-sequence");
      file.createSyncAccessHandle = async () => {
        throw new DOMException("sequence storage unavailable", "QuotaExceededError");
      };
      root.entries.set(file.name, file);
    }
    return root;
  };

  type Harness = Awaited<ReturnType<typeof worker>>;

  const answerConfirm = (h: Harness, answered: Set<unknown>) => {
    for (const ask of h.messages.filter(
      (m) => m.method === "workspace/confirmWorkspaceEdit" && "id" in m,
    )) {
      if (!answered.has(ask.id)) {
        answered.add(ask.id);
        void (globalThis as any).onmessage({
          data: {
            jsonrpc: "2.0",
            method: "workspace/confirmWorkspaceEdit",
            id: ask.id,
            result: { refusal: "an open script changed before the edit could be applied" },
          },
        });
      }
    }
  };

  const save = (h: Harness, path: string, text: string) =>
    h.start(`save-${path}`, "workspace/willWriteFiles", writeOf(path, text, editorOrigin(path)));

  type Plan = { pauseAt: number | "after"; ownership: Ownership; sequence: Sequence };

  const runCell = async ({ pauseAt, ownership, sequence }: Plan) => {
    const root = seedFor(sequence);
    const steps = storageSteps();
    try {
      const h = await worker(root);
      vi.spyOn(console, "warn").mockImplementation(() => {});
      await h.enumerate();
      const from = h.messages.length;
      const fromChannel = h.channelPosts.length;
      const answered = new Set<unknown>();
      let confirmAt: number | undefined;
      let saved = false;
      const saveAll = () => {
        saved = true;
        typedScripts(ownership).forEach((path) => save(h, path, TYPED[path]!));
      };
      steps.state.count = 0;
      steps.state.pauseAt = pauseAt === "after" ? Number.MAX_SAFE_INTEGER : pauseAt;
      steps.state.armed = true;
      h.start("edit", "workspace/applyWorkspaceEdit", {
        edit: rest,
        confirm: true,
        expectedTexts: { [uriOf("chapter.sd")]: PRE["chapter.sd"] },
      });
      for (let i = 0; i < 400 && !h.response("edit"); i += 1) {
        await vi.advanceTimersByTimeAsync(5);
        if (
          confirmAt === undefined &&
          h.messages.some((m) => m.method === "workspace/confirmWorkspaceEdit")
        ) {
          confirmAt = steps.state.count;
        }
        answerConfirm(h, answered);
        if (steps.state.paused && !saved) {
          saveAll();
          await vi.advanceTimersByTimeAsync(300);
          steps.state.release();
        }
      }
      const total = steps.state.count;
      steps.state.armed = false;
      if (!saved) {
        saveAll();
      }
      await vi.advanceTimersByTimeAsync(1000);
      return { root, h, from, fromChannel, confirmAt, total, response: h.response("edit") };
    } finally {
      steps.restore();
    }
  };

  const reloadsOver = (
    messages: any[],
    path: string,
    script: { text: string; stored: string; origin: string; savedBy?: string },
  ) => {
    let stored = script.stored;
    const reloads: string[] = [];
    for (const message of messages) {
      if (script.savedBy && message.id === script.savedBy && "result" in message) {
        stored = script.text;
      }
      if (message.method !== "workspace/didWriteFiles") {
        continue;
      }
      const file = message.params.files.find((f: any) => f.uri === uriOf(path));
      if (!file) {
        continue;
      }
      const write = {
        text: file.text,
        remote: message.params.remote,
        origin: message.params.origin,
        restored: message.params.restored?.includes(file.uri) ?? false,
      };
      if (reloadsForWrite(write, { text: script.text, stored, origin: script.origin })) {
        reloads.push(JSON.stringify(write));
      }
    }
    return reloads;
  };

  const cellsOf = (workerPart: number, total: number) => [
    ...Array.from({ length: total }, (_, i) => ({
      pauseAt: i + 1,
      name: `${i + 1 <= workerPart ? "worker's part" : "rollback"}, storage step ${i + 1} of ${total}`,
    })),
    { pauseAt: "after" as const, name: "after the edit answered" },
  ];

  const ROWS: { ownership: Ownership; sequence: Sequence; tab: Tab }[] = [
    ...OWNERSHIPS.flatMap((ownership) =>
      SEQUENCES.map((sequence) => ({ ownership, sequence, tab: "this tab" as Tab })),
    ),
    ...SEQUENCES.map((sequence) => ({
      ownership: "held" as Ownership,
      sequence,
      tab: "a second tab" as Tab,
    })),
  ];

  it.each(ROWS)(
    "keeps the typing in storage and in the editor at every step: $ownership, $sequence, $tab",
    async ({ ownership, sequence, tab }) => {
      const counted = await runCell({ pauseAt: "after", ownership, sequence });
      expect(counted.confirmAt).toBeDefined();
      const cells = cellsOf(counted.confirmAt!, counted.total);
      expect(cells.some((c) => c.name.startsWith("worker's part"))).toBe(true);
      expect(cells.some((c) => c.name.startsWith("rollback"))).toBe(true);
      const ran: string[] = [];
      const failures: string[] = [];
      for (const cell of cells) {
        const run = await runCell({ pauseAt: cell.pauseAt, ownership, sequence });
        ran.push(cell.name);
        const problems: string[] = [];
        if (run.response?.result?.applied !== false) {
          problems.push(`edit result ${JSON.stringify(run.response?.result)}`);
        }
        for (const path of typedScripts(ownership)) {
          if (textAt(run.root, path) !== TYPED[path]) {
            problems.push(`${path} stored ${JSON.stringify(textAt(run.root, path))}`);
          }
          if (tab === "this tab") {
            const reloads = reloadsOver(run.h.messages.slice(run.from), path, {
              text: TYPED[path]!,
              stored: PRE[path]!,
              origin: editorOrigin(path),
              savedBy: `save-${path}`,
            });
            if (reloads.length > 0) {
              problems.push(`${path} editor reloads for ${reloads.join(", ")}`);
            }
          }
        }
        if (tab === "a second tab") {
          const posts = run.h.channelPosts.slice(run.fromChannel);
          const second = await worker(run.root);
          await second.enumerate();
          const fromSecond = second.messages.length;
          for (const post of posts) {
            await second.remote(post.method, post.params);
          }
          await vi.advanceTimersByTimeAsync(500);
          const reloads = reloadsOver(second.messages.slice(fromSecond), "chapter.sd", {
            text: TYPED_IN_SECOND_TAB,
            stored: PRE["chapter.sd"]!,
            origin: editorOrigin("chapter.sd"),
          });
          if (reloads.length > 0) {
            problems.push(`second tab's chapter.sd editor reloads for ${reloads.join(", ")}`);
          }
        }
        if (problems.length > 0) {
          failures.push(`${cell.name}: ${problems.join("; ")}`);
        }
      }
      expect(ran).toEqual(cells.map((c) => c.name));
      expect(failures).toEqual([]);
    },
    300_000,
  );
});
