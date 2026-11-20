import { beforeEach, expect, it, vi } from "vitest";

const bin = vi.hoisted(() => {
  const live = new Set<string>();
  const refused = new Set<string>();
  let batches: { batchId: string; deletedAt: number; entries: { originalUri: string }[] }[] = [];
  let next = 0;
  const hooks: { beforeRefusal?: () => Promise<void>; duringMove?: () => Promise<void> } = {};
  const fs = {
    getFileUri: (projectId: string, path: string) => `file:///${projectId}/${path}`,
    deleteFiles: async ({ files, batchKey }: { files: { uri: string }[]; batchKey?: string }) => {
      const moved: string[] = [];
      const skipped: string[] = [];
      for (const { uri } of files) {
        if (!live.has(uri)) continue;
        if (refused.has(uri)) {
          skipped.push(uri);
        } else {
          live.delete(uri);
          moved.push(uri);
        }
      }
      let batchId: string | undefined;
      if (moved.length) {
        const deletedAt = Date.now();
        batchId = `${deletedAt}__${batchKey ?? `b${next++}`}`;
        batches.push({ batchId, deletedAt, entries: moved.map((originalUri) => ({ originalUri })) });
      }
      const during = hooks.duringMove;
      hooks.duringMove = undefined;
      await during?.();
      const deleted = moved.map((uri) => ({ uri }));
      if (skipped.length) {
        const before = hooks.beforeRefusal;
        hooks.beforeRefusal = undefined;
        await before?.();
        throw { code: -32603, message: `Cannot move ${skipped.join(", ")} to the bin`, data: { files: deleted, skipped, batchId } };
      }
      return deleted;
    },
    listTrash: async () => batches,
    restoreTrash: async (_projectId: string, batchId: string) => {
      const batch = batches.find((b) => b.batchId === batchId)!;
      batches = batches.filter((b) => b !== batch);
      batch.entries.forEach((e) => live.add(e.originalUri));
      return { files: batch.entries.map((e) => ({ uri: e.originalUri })), folders: [] };
    },
    getFolders: async () => [],
    createFolders: async () => [],
    deleteFolders: async () => [],
  };
  const reset = (uris: string[]) => {
    live.clear();
    refused.clear();
    batches = [];
    hooks.beforeRefusal = undefined;
    hooks.duringMove = undefined;
    uris.forEach((u) => live.add(u));
  };
  return { live, refused, fs, reset, hooks };
});

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: bin.fs,
    window: { recordScriptChange: async () => undefined, recordAssetChange: async () => undefined },
  },
}));
vi.mock("../../src/modules/spark-editor/workspace/WorkspaceStore", () => ({ default: {} }));
const showSnackbar = vi.hoisted(() => vi.fn());
vi.mock("../../src/modules/spark-editor/utils/snackbar", () => ({ showSnackbar }));

const history = await import("../../src/modules/spark-editor/utils/undoManager");
const { recordCreate, recordTrashDeletion, recordResolvedUpload } = await import(
  "../../src/modules/spark-editor/utils/fileUndo"
);
const { moveToTrash } = await import("../../src/modules/spark-editor/workspace/moveToTrash");

const a = "file:///p/Scripts/a.sd";
const b = "file:///p/Scripts/b.sd";
const files = () => [...bin.live].sort();
const keptNotice = { message: "Couldn't move a.sd to the bin. It is still where it was." };

beforeEach(() => {
  showSnackbar.mockClear();
  let clock = 1_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock++);
  history.clearUndoHistory();
  bin.reset([a, b]);
});

it("brings back every created file when a partly refused Undo is retried and then redone", async () => {
  recordCreate("p", [a, b], "2 scripts");
  bin.refused.add(a);
  expect(await history.undo()).toBe(false);
  expect(files()).toEqual([a]);
  expect(showSnackbar).toHaveBeenLastCalledWith(keptNotice);
  bin.refused.clear();
  expect(await history.undo()).toBe(true);
  expect(files()).toEqual([]);
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([a, b]);
});

it("leaves a file another action moved to the bin between a refused Undo and its retry to that action", async () => {
  recordCreate("p", [a, b], "2 scripts");
  bin.refused.add(a);
  expect(await history.undo()).toBe(false);
  bin.refused.clear();
  await bin.fs.deleteFiles({ files: [{ uri: a }] });
  const otherBatches = (await bin.fs.listTrash()).filter((batch) => batch.entries.some((e) => e.originalUri === a));
  expect(otherBatches).toHaveLength(1);
  expect(await history.undo()).toBe(true);
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([b]);
  expect(await bin.fs.listTrash()).toEqual(otherBatches);
});

it("leaves a file another action moved to the bin while a refused Undo was answering to that action", async () => {
  recordCreate("p", [a, b], "2 scripts");
  bin.refused.add(a);
  let otherBatches: Awaited<ReturnType<typeof bin.fs.listTrash>> = [];
  bin.hooks.beforeRefusal = async () => {
    bin.live.add(b);
    await bin.fs.deleteFiles({ files: [{ uri: b }] });
    otherBatches = (await bin.fs.listTrash()).slice(-1);
  };
  expect(await history.undo()).toBe(false);
  expect(otherBatches).toHaveLength(1);
  bin.refused.clear();
  expect(await history.undo()).toBe(true);
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([a, b]);
  expect(await bin.fs.listTrash()).toEqual(otherBatches);
});

it("brings back every deleted file when a partly refused Redo is retried and then undone", async () => {
  await bin.fs.deleteFiles({ files: [{ uri: a }, { uri: b }], batchKey: "delete" });
  await recordTrashDeletion("p", [a, b], "2 scripts", ["delete"]);
  expect(await history.undo()).toBe(true);
  bin.refused.add(a);
  expect(await history.redo()).toBe(false);
  expect(files()).toEqual([a]);
  expect(showSnackbar).toHaveBeenLastCalledWith(keptNotice);
  bin.refused.clear();
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([]);
  expect(await history.undo()).toBe(true);
  expect(files()).toEqual([a, b]);
});

it("brings back every added file when a partly refused Undo of an upload is retried and then redone", async () => {
  await recordResolvedUpload("p", [a, b], [], "upload", "2 files");
  bin.refused.add(a);
  expect(await history.undo()).toBe(false);
  expect(showSnackbar).toHaveBeenLastCalledWith(keptNotice);
  bin.refused.clear();
  expect(await history.undo()).toBe(true);
  expect(files()).toEqual([]);
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([a, b]);
});

type Batch = Awaited<ReturnType<typeof bin.fs.listTrash>>[number];

const otherTabBins = (uri: string, other: Batch[]) => {
  bin.hooks.duringMove = async () => {
    bin.live.add(uri);
    await bin.fs.deleteFiles({ files: [{ uri }] });
    other.push((await bin.fs.listTrash()).at(-1)!);
  };
};

it("restores only its own batch when another tab bins the same file while Delete and its Redo run", async () => {
  const other: Batch[] = [];
  otherTabBins(a, other);
  const items = [{ path: "Scripts/a.sd", folder: false }, { path: "Scripts/b.sd", folder: false }];
  await moveToTrash(bin.fs as never, "p", items, "2 scripts");
  expect(other).toHaveLength(1);
  expect(await history.undo()).toBe(true);
  expect(files()).toEqual([a, b]);
  expect(await bin.fs.listTrash()).toEqual(other);
  otherTabBins(a, other);
  expect(await history.redo()).toBe(true);
  expect(other).toHaveLength(2);
  expect(await history.undo()).toBe(true);
  expect(files()).toEqual([a, b]);
  expect(await bin.fs.listTrash()).toEqual(other);
});

it("restores only its own batch when another tab bins the same file while Undo of a create runs", async () => {
  recordCreate("p", [a, b], "2 scripts");
  const other: Batch[] = [];
  otherTabBins(a, other);
  expect(await history.undo()).toBe(true);
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([a, b]);
  expect(await bin.fs.listTrash()).toEqual(other);
});

it("restores only its own batch when another tab bins the same file while Undo of an upload runs", async () => {
  await recordResolvedUpload("p", [a, b], [], "upload", "2 files");
  const other: Batch[] = [];
  otherTabBins(a, other);
  expect(await history.undo()).toBe(true);
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([a, b]);
  expect(await bin.fs.listTrash()).toEqual(other);
});

it("restores only the replaced file's batch when another tab bins it while the replace and its Redo run", async () => {
  bin.live.delete(a);
  const other: Batch[] = [];
  otherTabBins(b, other);
  await bin.fs.deleteFiles({ files: [{ uri: b }], batchKey: "replace" });
  bin.live.add(a);
  await recordResolvedUpload("p", [a], [b], "replace", "a.sd");
  const holding = async (uri: string) =>
    (await bin.fs.listTrash()).filter((batch) => batch.entries.some((e) => e.originalUri === uri));
  expect(await history.undo()).toBe(true);
  expect(files()).toEqual([b]);
  expect(await holding(b)).toEqual(other);
  otherTabBins(b, other);
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([a]);
  expect(await history.undo()).toBe(true);
  expect(files()).toEqual([b]);
  expect(await holding(b)).toEqual(other);
});

it("offers Undo for a duplicate in a toast whose action moves the copy and its folders to the bin", async () => {
  const deleting = vi.spyOn(bin.fs, "deleteFiles");
  const removing = vi.spyOn(bin.fs, "deleteFolders");
  recordCreate("p", [a, b], "Drafts_copy", { folders: ["Scripts"], message: "Folder duplicated." });
  expect(showSnackbar).toHaveBeenCalledTimes(1);
  const toast = showSnackbar.mock.calls[0]![0];
  expect(toast).toMatchObject({ message: "Folder duplicated.", actionLabel: "Undo" });
  toast.onAction();
  await vi.waitFor(() => expect(files()).toEqual([]));
  expect(deleting).toHaveBeenCalledWith(
    expect.objectContaining({ folders: [{ uri: "file:///p/Scripts" }], mode: "trash" }),
  );
  await vi.waitFor(() => expect(removing).toHaveBeenCalledWith("p", ["Scripts"]));
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([a, b]);
});

it("shows no toast for a creation recorded without a message", () => {
  recordCreate("p", [a], "a.sd");
  expect(showSnackbar).not.toHaveBeenCalled();
});
