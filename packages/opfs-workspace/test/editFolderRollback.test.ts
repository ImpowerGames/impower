import { afterEach, expect, it, vi } from "vitest";
import { allocateCommit } from "../src/utils/commitSequence";
import {
  listMemory,
  makeMemoryDirectory,
  MemoryDirectory,
  MemoryFile,
  memoryLocks,
  memoryRoot,
  writeMemoryFile,
} from "./memoryOpfs";

const enc = new TextEncoder();
const uri = (path: string) => `file://local/${path}`;
const create = (path: string, text: string) => ({ kind: "create", uri: uri(path), data: enc.encode(text).buffer });
const folder = (kind: "create" | "delete", path: string) => ({ kind, uri: uri(path), folder: true });
const del = (path: string) => ({ kind: "delete", uri: uri(path) });
const rename = (from: string, to: string) => ({ kind: "rename", oldUri: uri(from), newUri: uri(to) });
const insert = (path: string, text: string) => ({
  textDocument: { uri: uri(path), version: null },
  edits: [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: text }],
});
const lockName = (path: string) => `opfs-workspace:commit:${uri(path)}`;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function harness(files: Record<string, string> = {}) {
  vi.resetModules();
  const root = memoryRoot();
  makeMemoryDirectory(root, "local");
  Object.entries(files).forEach(([path, text]) => writeMemoryFile(root, `local/${path}`, enc.encode(text)));
  const project = root.entries.get("local") as MemoryDirectory;
  const messages: any[] = [];
  const locks = memoryLocks();
  vi.stubGlobal("navigator", { storage: { getDirectory: async () => root }, locks });
  vi.stubGlobal("BroadcastChannel", class {
    onmessage = null;
    postMessage() {}
    close() {}
  });
  vi.stubGlobal("postMessage", (message: any) => messages.push(message));
  vi.stubGlobal("onmessage", null);
  vi.stubGlobal("self", globalThis);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  await import("../src/opfs-workspace");
  let requests = 0;
  const request = async (method: string, params: unknown) => {
    const id = `request-${(requests += 1)}`;
    await (globalThis as any).onmessage({ data: { jsonrpc: "2.0", id, method, params } });
    const response = messages.find((m) => m.id === id && ("result" in m || "error" in m));
    if (!response) throw new Error(`Missing response ${id}`);
    return response;
  };
  await request("workspace/didChangeConfiguration", { settings: { scriptFiles: "*.sd" } }).catch(() => {});
  await request("workspace/readDirectoryFiles", { directory: { uri: "file://local" } });
  const edit = async (changes: unknown[]) =>
    (await request("workspace/applyWorkspaceEdit", { edit: { documentChanges: changes } })).result;
  const entry = (path: string) =>
    path.split("/").reduce<MemoryDirectory | MemoryFile | undefined>(
      (parent, name) => (parent instanceof MemoryDirectory ? parent.entries.get(name) : undefined),
      project,
    );
  const text = (path: string) => {
    const found = entry(path);
    return found?.kind === "file" ? new TextDecoder().decode(found.bytes) : undefined;
  };
  const failAt = (action: () => void = () => {}) => {
    const get = project.getDirectoryHandle.bind(project);
    project.getDirectoryHandle = async (name, options = {}) => {
      if (name === "fail" && options.create) {
        action();
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new DOMException("the later write fails", "QuotaExceededError");
      }
      return get(name, options);
    };
  };
  const otherTab = (path: string, action: () => Promise<void> | void) => {
    const chain = path.split("/");
    const take = (depth: number): Promise<void> =>
      depth < chain.length - 1
        ? locks.request(lockName(chain.slice(0, depth + 1).join("/")), { mode: "shared" }, () => take(depth + 1))
        : locks.request(lockName(path), async () => {
            await action();
            await allocateCommit(root as unknown as FileSystemDirectoryHandle, "other-tab", 0);
          });
    return locks.request(`opfs-workspace:commit:file://local`, { mode: "shared" }, () => take(0));
  };
  const paths = () => listMemory(root, "local").filter((path) => !path.startsWith(".trash"));
  return { root, project, locks, request, edit, entry, text, failAt, otherTab, paths };
}

it("restores a file the edit replaced with a folder holding a file", async () => {
  const h = await harness({ "cover.png": "OLD IMAGE" });
  h.failAt();
  const result = await h.edit([del("cover.png"), create("cover.png/new.png", "NEW IMAGE"), create("fail/new.sd", "NEW")]);
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.paths()).toEqual(["cover.png"]);
  expect(h.text("cover.png")).toBe("OLD IMAGE");
});

it("restores nested folders and their file that the edit replaced with a file", async () => {
  const h = await harness({ "cover.png/a/b/notes.sd": "OLD NOTES", "main.sd": "OLD MAIN" });
  h.failAt();
  const result = await h.edit([
    del("cover.png/a/b/notes.sd"),
    folder("delete", "cover.png/a/b"),
    folder("delete", "cover.png/a"),
    folder("delete", "cover.png"),
    create("cover.png", "NEW IMAGE"),
    create("main.sd", "NEW MAIN"),
    create("fail/new.sd", "NEW"),
  ]);
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("cover.png/a/b/notes.sd")).toBe("OLD NOTES");
  expect(h.text("main.sd")).toBe("OLD MAIN");
});

it("reports a complete rollback after removing the empty folder the edit created", async () => {
  const h = await harness({ "main.sd": "OLD MAIN" });
  h.failAt();
  const result = await h.edit([create("main.sd", "NEW MAIN"), folder("create", "empty"), folder("create", "fail")]);
  expect(h.paths()).toEqual(["main.sd"]);
  expect(h.text("main.sd")).toBe("OLD MAIN");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
});

it("reports a folder it cannot clear before restoring a file, and keeps the edit's file in the Trash", async () => {
  const h = await harness({ "cover.png": "OLD IMAGE", "main.sd": "OLD MAIN" });
  h.failAt(() => {
    const directory = h.entry("cover.png") as MemoryDirectory;
    const remove = directory.removeEntry.bind(directory);
    directory.removeEntry = async (name, options) => {
      if (name === "new.png") throw new DOMException("cannot clear", "NoModificationAllowedError");
      return remove(name, options);
    };
  });
  const result = await h.edit([
    del("cover.png"),
    create("main.sd", "NEW MAIN"),
    create("cover.png/new.png", "NEW IMAGE"),
    create("fail/new.sd", "NEW"),
  ]);
  expect(result.rollback.complete).toBe(false);
  expect(result.rollback.failed).toContain(uri("cover.png"));
  expect(result.rollback.trashed).toContain(uri("cover.png/new.png"));
  expect(h.text("cover.png/new.png")).toBe("NEW IMAGE");
});

it("reports a complete rollback when a failed write already left the file as it was", async () => {
  const h = await harness({ "main.sd": "ORIGINAL" });
  const file = h.entry("main.sd") as MemoryFile;
  const access = file.createSyncAccessHandle.bind(file);
  let calls = 0;
  file.createSyncAccessHandle = async () => {
    const handle = await access();
    return {
      ...handle,
      write: (data: DataView | Uint8Array) => {
        calls += 1;
        if (calls === 1) throw new DOMException("disk full", "QuotaExceededError");
        return handle.write(data);
      },
    };
  };
  const result = await h.edit([create("main.sd", "IMPORTED")]);
  expect(h.text("main.sd")).toBe("ORIGINAL");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
});

type Harness = Awaited<ReturnType<typeof harness>>;

const waitsForTheEdit = async (
  files: Record<string, string>,
  changes: unknown[],
  path: string,
  foreign: (h: Harness) => Promise<void> | void,
  seen: (h: Harness) => unknown,
) => {
  const h = await harness(files);
  let pending: Promise<void> | undefined;
  let during: unknown = "not run";
  h.failAt(() => {
    pending = h.otherTab(path, async () => {
      during = seen(h);
      await foreign(h);
    });
  });
  const result = await h.edit([...changes, create("fail/new.sd", "NEW")]);
  await pending;
  return { h, result, during };
};

it("makes another tab's save at a path the edit wrote wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    { "main.sd": "ORIGINAL" },
    [create("main.sd", "IMPORTED")],
    "main.sd",
    (h) => writeMemoryFile(h.root, "local/main.sd", enc.encode("OTHER TAB SAVE")),
    (h) => h.text("main.sd"),
  );
  expect(during).toBe("ORIGINAL");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("main.sd")).toBe("OTHER TAB SAVE");
});

it("makes another tab's save at a path the edit deleted wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    { "old/notes.sd": "ORIGINAL" },
    [del("old/notes.sd"), folder("delete", "old")],
    "old/notes.sd",
    (h) => writeMemoryFile(h.root, "local/old/notes.sd", enc.encode("OTHER TAB SAVE")),
    (h) => h.text("old/notes.sd"),
  );
  expect(during).toBe("ORIGINAL");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("old/notes.sd")).toBe("OTHER TAB SAVE");
});

it("makes another tab's folder inside a folder the edit created wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    {},
    [folder("create", "generated")],
    "generated/personal",
    (h) => makeMemoryDirectory(h.root, "local/generated/personal"),
    (h) => h.entry("generated")?.kind ?? "absent",
  );
  expect(during).toBe("absent");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.paths()).toContain("generated/personal/");
});

it("makes another tab's folder at a path the edit created a folder wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    {},
    [folder("create", "generated")],
    "generated",
    async (h) => {
      await h.project.getDirectoryHandle("generated", { create: true });
    },
    (h) => h.entry("generated")?.kind ?? "absent",
  );
  expect(during).toBe("absent");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.paths()).toContain("generated/");
});

it("makes another tab's save where the edit made a folder in place of a file wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    { "cover.png": "ORIGINAL" },
    [del("cover.png"), folder("create", "cover.png")],
    "cover.png",
    (h) => writeMemoryFile(h.root, "local/cover.png", enc.encode("OTHER TAB SAVE")),
    (h) => h.text("cover.png"),
  );
  expect(during).toBe("ORIGINAL");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("cover.png")).toBe("OTHER TAB SAVE");
});

it("makes another tab's save where the edit wrote a file in place of a folder wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    { "cover.png/notes.sd": "ORIGINAL" },
    [del("cover.png/notes.sd"), folder("delete", "cover.png"), create("cover.png", "IMPORTED")],
    "cover.png/notes.sd",
    (h) => writeMemoryFile(h.root, "local/cover.png/notes.sd", enc.encode("OTHER TAB SAVE")),
    (h) => h.text("cover.png/notes.sd"),
  );
  expect(during).toBe("ORIGINAL");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("cover.png/notes.sd")).toBe("OTHER TAB SAVE");
});

it("makes another tab's deletion of a file the edit wrote wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    { "main.sd": "ORIGINAL" },
    [create("main.sd", "IMPORTED")],
    "main.sd",
    (h) => h.project.removeEntry("main.sd"),
    (h) => h.text("main.sd"),
  );
  expect(during).toBe("ORIGINAL");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("main.sd")).toBeUndefined();
});

it("makes another tab's save at a renamed path wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    { "a.sd": "ORIGINAL" },
    [rename("a.sd", "b.sd")],
    "b.sd",
    (h) => writeMemoryFile(h.root, "local/b.sd", enc.encode("OTHER TAB SAVE")),
    (h) => [h.text("a.sd"), h.text("b.sd")],
  );
  expect(during).toEqual(["ORIGINAL", undefined]);
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("a.sd")).toBe("ORIGINAL");
  expect(h.text("b.sd")).toBe("OTHER TAB SAVE");
});

it("makes another tab's save at a rename's old path wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    { "a.sd": "ORIGINAL" },
    [rename("a.sd", "b.sd")],
    "a.sd",
    (h) => writeMemoryFile(h.root, "local/a.sd", enc.encode("OTHER TAB SAVE")),
    (h) => [h.text("a.sd"), h.text("b.sd")],
  );
  expect(during).toEqual(["ORIGINAL", undefined]);
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("a.sd")).toBe("OTHER TAB SAVE");
  expect(h.text("b.sd")).toBeUndefined();
});

it("makes another tab's save at a text-edited path wait, then lands after the rollback", async () => {
  const { h, result, during } = await waitsForTheEdit(
    { "main.sd": "ORIGINAL" },
    [insert("main.sd", "EDITED ")],
    "main.sd",
    (h) => writeMemoryFile(h.root, "local/main.sd", enc.encode("OTHER TAB SAVE")),
    (h) => h.text("main.sd"),
  );
  expect(during).toBe("ORIGINAL");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("main.sd")).toBe("OTHER TAB SAVE");
});

it("makes another tab's save after a failed write recovered wait, then lands after the rollback", async () => {
  const h = await harness({ "main.sd": "ORIGINAL" });
  const file = h.entry("main.sd") as MemoryFile;
  const access = file.createSyncAccessHandle.bind(file);
  let calls = 0;
  let pending: Promise<void> | undefined;
  let during: string | undefined;
  file.createSyncAccessHandle = async () => {
    const handle = await access();
    return {
      ...handle,
      write: (data: DataView | Uint8Array) => {
        calls += 1;
        if (calls === 1) {
          pending = h.otherTab("main.sd", () => {
            during = h.text("main.sd");
            writeMemoryFile(h.root, "local/main.sd", enc.encode("OTHER TAB SAVE"));
          });
          throw new DOMException("disk full", "QuotaExceededError");
        }
        return handle.write(data);
      },
    };
  };
  const result = await h.edit([create("main.sd", "IMPORTED")]);
  await pending;
  expect(during).toBe("ORIGINAL");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
  expect(h.text("main.sd")).toBe("OTHER TAB SAVE");
});

it("settles two overlapping edits that touch the same paths in opposite orders", async () => {
  const h = await harness({ "a.sd": "A", "b.sd": "B" });
  const settled = await Promise.race([
    Promise.all([
      h.edit([create("a.sd", "FIRST A"), create("b.sd", "FIRST B")]),
      h.edit([create("b.sd", "SECOND B"), create("a.sd", "SECOND A")]),
    ]),
    new Promise<"deadlock">((resolve) => setTimeout(() => resolve("deadlock"), 5000)),
  ]);
  expect(settled).not.toBe("deadlock");
  expect((settled as { applied: boolean }[]).map((r) => r.applied)).toEqual([true, true]);
  expect([h.text("a.sd"), h.text("b.sd")]).toEqual(["SECOND A", "SECOND B"]);
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const save = (h: Harness, path: string, text: string) =>
  h.request("workspace/willCreateFiles", { files: [create(path, text)] });

it("lets this tab's save to a path an edit is still acquiring wait for the edit, without deadlock", async () => {
  const h = await harness({ "a.sd": "A", "b.sd": "B" });
  const releaseB = deferred();
  const bHeld = deferred();
  const other = h.locks.request(lockName("b.sd"), async () => {
    bHeld.resolve();
    await releaseB.promise;
  });
  await bHeld.promise;
  const edit = h.edit([create("a.sd", "EDIT A"), create("b.sd", "EDIT B")]);
  await delay(20);
  const saved = save(h, "a.sd", "SAME WORKER SAVE");
  await delay(20);
  releaseB.resolve();
  await other;
  const outcome = await Promise.race([
    Promise.all([edit, saved]).then(() => "settled"),
    delay(2000).then(() => "deadlock"),
  ]);
  expect(outcome).toBe("settled");
  expect(h.text("b.sd")).toBe("EDIT B");
  expect(["EDIT A", "SAME WORKER SAVE"]).toContain(h.text("a.sd"));
});

it("rolls back before a later step rewrites a path this tab saved during the edit, and keeps the save", async () => {
  const h = await harness({ "a.sd": "ORIGINAL" });
  h.failAt();
  const get = h.project.getDirectoryHandle.bind(h.project);
  let saved = false;
  h.project.getDirectoryHandle = async (name, options = {}) => {
    if (name === "gate" && options.create && !saved) {
      saved = true;
      const response = await save(h, "a.sd", "SAME WORKER SAVE");
      expect(response.error).toBeUndefined();
    }
    return get(name, options);
  };
  const result = await h.edit([
    create("a.sd", "FIRST EDIT"),
    folder("create", "gate"),
    create("a.sd", "SECOND EDIT"),
    create("fail/new.sd", "FAIL"),
  ]);
  expect(saved).toBe(true);
  expect(result.applied).toBe(false);
  expect(h.text("a.sd")).toBe("SAME WORKER SAVE");
  expect(result.rollback.kept).toContain(uri("a.sd"));
});

it("refuses a folder change at a path that holds a file, leaving the file as it was", async () => {
  const h = await harness({ "cover.png": "ORIGINAL" });
  h.failAt();
  const result = await h.edit([folder("delete", "cover.png"), create("cover.png", "IMPORTED"), create("fail/new.sd", "FAIL")]);
  expect(result.applied).toBe(false);
  expect(result.failureReason).toMatch(/cover\.png is a file, not a folder/);
  expect(h.text("cover.png")).toBe("ORIGINAL");
  expect(result.rollback).toMatchObject({ complete: true, failed: [], kept: [] });
});

it("keeps this tab's deletion of a folder the edit holds shared waiting for the exclusive lock", async () => {
  const h = await harness({ "seed.sd": "S" });
  makeMemoryDirectory(h.root, "local/parent");
  const get = h.project.getDirectoryHandle.bind(h.project);
  let deletion: Promise<unknown> | undefined;
  let foreignHeld = false;
  let deletedWhileForeignHeld = false;
  const releaseParent = deferred();
  let foreign: Promise<void> | undefined;
  h.project.getDirectoryHandle = async (name, options = {}) => {
    if (name === "gate" && options.create && !deletion) {
      const parentHeld = deferred();
      foreign = h.locks.request(lockName("parent"), { mode: "shared" }, async () => {
        foreignHeld = true;
        parentHeld.resolve();
        await releaseParent.promise;
        foreignHeld = false;
      });
      await parentHeld.promise;
      const remove = h.project.removeEntry.bind(h.project);
      h.project.removeEntry = async (entry, opts) => {
        if (entry === "parent") deletedWhileForeignHeld = foreignHeld;
        return remove(entry, opts);
      };
      deletion = h.request("workspace/directories", { action: "delete", uris: [uri("parent")] });
    }
    return get(name, options);
  };
  const result = await h.edit([folder("create", "gate"), create("parent/new.sd", "EDIT")]);
  await delay(20);
  releaseParent.resolve();
  await foreign;
  await deletion;
  expect(result.applied).toBe(true);
  expect(deletedWhileForeignHeld).toBe(false);
});

it("does not deadlock when a rollback writes its Trash copy while another edit waits on the Trash folder", async () => {
  const h = await harness({ "a.sd": "ORIGINAL" });
  const get = h.project.getDirectoryHandle.bind(h.project);
  let other: Promise<unknown> | undefined;
  h.project.getDirectoryHandle = async (name, options = {}) => {
    if (name === "fail" && options.create) {
      other = h.edit([create(".trash/backup.sd", "BACKUP TRASH"), create("a.sd", "OTHER EDIT")]);
      await delay(20);
      throw new DOMException("later quota failure", "QuotaExceededError");
    }
    return get(name, options);
  };
  const first = h.edit([create("a.sd", "IMPORTED"), create("fail/new.sd", "FAIL")]);
  const outcome = await Promise.race([
    first.then(async (result) => [result, await other]),
    delay(3000).then(() => "deadlock"),
  ]);
  expect(outcome).not.toBe("deadlock");
  const [firstResult, otherResult] = outcome as { applied: boolean; rollback?: { complete: boolean } }[];
  expect(firstResult!.applied).toBe(false);
  expect(firstResult!.rollback?.complete).toBe(true);
  expect(otherResult!.applied).toBe(true);
  expect(h.text("a.sd")).toBe("OTHER EDIT");
});

it("removes a file the edit wrote at a folder path that was missing when it began", async () => {
  const h = await harness();
  h.failAt();
  const result = await h.edit([folder("create", "p"), folder("delete", "p"), create("p", "LEFTOVER"), create("fail/x.sd", "FAIL")]);
  expect(result.applied).toBe(false);
  expect(result.rollback.complete).toBe(true);
  expect(h.entry("p")).toBeUndefined();
});

it("keeps the edit's locks until this tab's save that borrowed one has finished", async () => {
  const h = await harness({ "a.sd": "ORIGINAL" });
  const file = h.entry("a.sd") as MemoryFile;
  const entered = deferred();
  const release = deferred();
  const access = file.createSyncAccessHandle.bind(file);
  let accesses = 0;
  file.createSyncAccessHandle = async () => {
    accesses += 1;
    if (accesses === 2) {
      entered.resolve();
      await release.promise;
    }
    return access();
  };
  let saved: Promise<unknown> | undefined;
  const get = h.project.getDirectoryHandle.bind(h.project);
  h.project.getDirectoryHandle = async (name, options = {}) => {
    if (name === "gate" && options.create && !saved) {
      saved = save(h, "a.sd", "SAME TAB");
      await entered.promise;
    }
    return get(name, options);
  };
  const edit = h.edit([create("a.sd", "EDIT"), folder("create", "gate")]);
  await entered.promise;
  let foreignEntered = false;
  const foreign = h.otherTab("a.sd", () => {
    foreignEntered = true;
    writeMemoryFile(h.root, "local/a.sd", enc.encode("OTHER TAB"));
  });
  await Promise.race([edit, delay(500)]);
  await delay(30);
  const enteredBeforeSaveFinished = foreignEntered;
  release.resolve();
  await Promise.all([edit, saved, foreign]);
  expect(enteredBeforeSaveFinished).toBe(false);
  expect(h.text("a.sd")).toBe("OTHER TAB");
});

it("takes a parent another tab removed while the edit was planning its locks as exclusive, and rolls back", async () => {
  const h = await harness();
  makeMemoryDirectory(h.root, "local/parent");
  h.failAt();
  const held = deferred();
  const planned = deferred();
  const request = h.locks.request.bind(h.locks);
  const other = request(lockName("parent"), async () => {
    held.resolve();
    await planned.promise;
    await h.project.removeEntry("parent");
  });
  await held.promise;
  (navigator as any).locks = {
    request: (name: string, options: any, callback?: any) => {
      if (name === lockName("parent") && options?.mode === "shared") planned.resolve();
      return request(name, options, callback);
    },
  };
  const editing = h.edit([create("parent/new.sd", "EDIT"), create("fail/x.sd", "FAIL")]);
  await other;
  const result = await Promise.race([editing, delay(2000).then(() => "deadlock" as const)]);
  expect(result).not.toBe("deadlock");
  expect((result as { rollback: { complete: boolean } }).rollback.complete).toBe(true);
  expect(h.entry("parent")).toBeUndefined();
});

it("stops replanning after a few attempts when another tab keeps removing a parent, and changes nothing", async () => {
  const h = await harness({ "main.sd": "ORIGINAL" });
  makeMemoryDirectory(h.root, "local/parent");
  const request = h.locks.request.bind(h.locks);
  let sharedHolds = 0;
  (navigator as any).locks = {
    request: (name: string, options: any, callback?: any) => {
      if (name === lockName("parent") && options?.mode === "shared") {
        sharedHolds += 1;
        return request(name, options, async () => {
          await h.project.removeEntry("parent");
          try {
            return await callback();
          } finally {
            makeMemoryDirectory(h.root, "local/parent");
          }
        });
      }
      return request(name, options, callback);
    },
  };
  const result = await Promise.race([
    h.edit([create("main.sd", "EDITED"), create("parent/new.sd", "NEW")]),
    delay(3000).then(() => "spinning" as const),
  ]);
  expect(result).not.toBe("spinning");
  expect((result as { applied: boolean }).applied).toBe(false);
  expect((result as { rollback: { complete: boolean } }).rollback.complete).toBe(true);
  expect(sharedHolds).toBe(3);
  expect(h.text("main.sd")).toBe("ORIGINAL");
  expect(h.entry("parent/new.sd")).toBeUndefined();
});
