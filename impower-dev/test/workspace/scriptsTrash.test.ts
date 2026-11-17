import { afterEach, expect, it, vi } from "vitest";
import { makeMemoryDirectory, writeMemoryFile } from "../../../packages/opfs-workspace/test/memoryOpfs";
import { releaseStorageWorker, storageWorkerHarness } from "./storageWorkerHarness";

const services = vi.hoisted(() => ({
  fs: null as any,
  window: {
    recordScriptChange: async () => undefined,
    recordAssetChange: async () => undefined,
    openFileEditor: () => undefined,
    getActiveEditorForFile: () => undefined,
  },
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: services }));

afterEach(releaseStorageWorker);

async function harness() {
  const h = await storageWorkerHarness(services, { "main.sd": "Hello", ".layout": "1", ".folders": "1" });
  const history = await import("../../src/modules/spark-editor/utils/undoManager");
  history.clearUndoHistory();
  return { ...h, history };
}

it("keeps a deleted empty folder in the bin after its Undo has gone, and Restore brings it back", async () => {
  const h = await harness();
  makeMemoryDirectory(h.root, "local/Scripts/Empty");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Empty"]);
  expect(await h.fs.getFolders("local")).not.toContain("Scripts/Empty");
  h.history.clearUndoHistory();
  const batches = await h.fs.listTrash("local");
  expect(batches).toHaveLength(1);
  expect(batches[0]!.folders).toEqual(["Scripts/Empty"]);
  await h.fs.restoreTrash("local", batches[0]!.batchId);
  await vi.waitFor(async () => expect(await h.fs.getFolders("local")).toContain("Scripts/Empty"));
  expect(await h.fs.listTrash("local")).toEqual([]);
});

it("restores a deleted folder beside a live script now holding its name, with what it held", async () => {
  const h = await harness();
  makeMemoryDirectory(h.root, "local/Scripts/Drafts.sd/Empty");
  await h.write("Scripts/Drafts.sd/old.sd", "deleted version");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Drafts.sd"]);
  const [batch] = await h.fs.listTrash("local");
  await h.write("Scripts/Drafts.sd", "unrelated live script");
  const restored = await h.fs.restoreTrash("local", batch!.batchId);
  expect(restored.folders).toEqual(["Scripts/Drafts.sd (restored)", "Scripts/Drafts.sd (restored)/Empty"]);
  expect(await h.read("Scripts/Drafts.sd")).toBe("unrelated live script");
  expect(await h.read("Scripts/Drafts.sd (restored)/old.sd")).toBe("deleted version");
  await vi.waitFor(async () =>
    expect(await h.fs.getFolders("local")).toContain("Scripts/Drafts.sd (restored)/Empty"),
  );
  expect(await h.fs.listTrash("local")).toEqual([]);
});

it("redo removes the version Undo restored and preserves the live conflicting script", async () => {
  const h = await harness();
  await h.write("Scripts/Drafts/old.sd", "deleted version");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Drafts"]);
  await h.write("Scripts/Drafts/old.sd", "other tab's live version");
  expect(await h.history.undo()).toBe(true);
  expect(await h.read("Scripts/Drafts/old (restored).sd")).toBe("deleted version");
  expect(await h.read("Scripts/Drafts/old.sd")).toBe("other tab's live version");
  expect(await h.history.redo()).toBe(true);
  const files = await h.fs.getFiles("local");
  expect(Object.keys(files)).toContain(h.uri("Scripts/Drafts/old.sd"));
  expect(Object.keys(files)).not.toContain(h.uri("Scripts/Drafts/old (restored).sd"));
});

it("round trips folder-only Undo and redo, then Empty removes its batch", async () => {
  const h = await harness();
  makeMemoryDirectory(h.root, "local/Scripts/Empty/Inner");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Empty"]);
  expect(await h.history.undo()).toBe(true);
  expect(await h.fs.getFolders("local")).toContain("Scripts/Empty/Inner");
  expect(await h.history.redo()).toBe(true);
  expect(await h.fs.getFolders("local")).not.toContain("Scripts/Empty");
  expect((await h.fs.listTrash("local"))[0]!.folders).toContain("Scripts/Empty/Inner");
  await h.fs.emptyTrash("local");
  expect(await h.fs.listTrash("local")).toEqual([]);
});

it("restores a manifest without folders and purges a folder-only expired batch", async () => {
  const h = await harness();
  const batchId = "1__old";
  writeMemoryFile(h.root, `local/.trash/${batchId}/Scripts/old.sd`, h.bytes("old bytes"));
  writeMemoryFile(h.root, `local/.trash/${batchId}/__manifest.json`, h.bytes(JSON.stringify({
    deletedAt: 1,
    entries: [{ relPath: "Scripts/old.sd", originalUri: h.uri("Scripts/old.sd"), type: "script" }],
  })));
  expect((await h.fs.listTrash("local"))[0]!.folders).toBeUndefined();
  await h.fs.restoreTrash("local", batchId);
  expect(await h.read("Scripts/old.sd")).toBe("old bytes");
  makeMemoryDirectory(h.root, "local/Scripts/Empty");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Empty"]);
  await h.fs.purgeExpiredTrash("local", -1);
  expect(await h.fs.listTrash("local")).toEqual([]);
});

it("undoes a creation again from where its redo restored it, never the script that took its name", async () => {
  const h = await harness();
  const { recordCreate } = await import("../../src/modules/spark-editor/utils/fileUndo");
  await h.write("Scripts/new.sd", "created");
  recordCreate("local", [h.uri("Scripts/new.sd")], "new.sd");
  expect(await h.history.undo()).toBe(true);
  await h.write("Scripts/new.sd", "other script");
  expect(await h.history.redo()).toBe(true);
  expect(await h.read("Scripts/new (restored).sd")).toBe("created");
  expect(await h.history.undo()).toBe(true);
  const files = Object.keys(await h.fs.getFiles("local"));
  expect(files).toContain(h.uri("Scripts/new.sd"));
  expect(files).not.toContain(h.uri("Scripts/new (restored).sd"));
  expect(await h.read("Scripts/new.sd")).toBe("other script");
});

it("undoes a new script by moving it to the bin, and redoes it where it was", async () => {
  const h = await harness();
  await h.scripts.load();
  const path = await h.scripts.createScript("");
  expect(path).toBe("Scripts/Untitled script.sd");
  expect(h.history.nextUndoLabel.value).toBe("Create Untitled script.sd");
  expect(await h.history.undo()).toBe(true);
  expect(Object.keys(await h.fs.getFiles("local"))).not.toContain(h.uri(path));
  expect((await h.fs.listTrash("local")).flatMap((batch) => batch.entries.map((e) => e.originalUri))).toEqual([
    h.uri(path),
  ]);
  expect(await h.history.redo()).toBe(true);
  await vi.waitFor(async () => expect(Object.keys(await h.fs.getFiles("local"))).toContain(h.uri(path)));
  expect(await h.read(path)).toBe("");
  expect(await h.fs.listTrash("local")).toEqual([]);
});

it("redo leaves an empty folder that appeared inside a restored folder after Undo", async () => {
  const h = await harness();
  await h.write("Scripts/Drafts/old.sd", "deleted version");
  await h.scripts.load();
  await h.scripts.remove(["Scripts/Drafts"]);
  expect(await h.history.undo()).toBe(true);
  await h.fs.createFolder("local", "Scripts/Drafts/KeepEmpty");
  expect(await h.history.redo()).toBe(true);
  expect(Object.keys(await h.fs.getFiles("local"))).not.toContain(h.uri("Scripts/Drafts/old.sd"));
  expect(await h.fs.listFolders("local")).toContain("Scripts/Drafts/KeepEmpty");
  expect(await h.history.undo()).toBe(true);
  expect(await h.read("Scripts/Drafts/old.sd")).toBe("deleted version");
});
