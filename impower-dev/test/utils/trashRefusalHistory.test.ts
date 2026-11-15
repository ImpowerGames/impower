import { beforeEach, expect, it, vi } from "vitest";

const bin = vi.hoisted(() => {
  const live = new Set<string>();
  const refused = new Set<string>();
  let batches: { batchId: string; deletedAt: number; entries: { originalUri: string }[] }[] = [];
  let next = 0;
  const fs = {
    getFileUri: (projectId: string, path: string) => `file:///${projectId}/${path}`,
    deleteFiles: async ({ files }: { files: { uri: string }[] }) => {
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
      if (moved.length) {
        batches.push({ batchId: `b${next++}`, deletedAt: Date.now(), entries: moved.map((originalUri) => ({ originalUri })) });
      }
      const deleted = moved.map((uri) => ({ uri }));
      if (skipped.length) {
        throw { code: -32603, message: `Cannot move ${skipped.join(", ")} to the bin`, data: { files: deleted, skipped } };
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
    uris.forEach((u) => live.add(u));
  };
  return { live, refused, fs, reset };
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

it("brings back every deleted file when a partly refused Redo is retried and then undone", async () => {
  const since = Date.now();
  await bin.fs.deleteFiles({ files: [{ uri: a }, { uri: b }] });
  await recordTrashDeletion("p", [a, b], "2 scripts", since);
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
  await recordResolvedUpload("p", [a, b], [], 0, "2 files");
  bin.refused.add(a);
  expect(await history.undo()).toBe(false);
  expect(showSnackbar).toHaveBeenLastCalledWith(keptNotice);
  bin.refused.clear();
  expect(await history.undo()).toBe(true);
  expect(files()).toEqual([]);
  expect(await history.redo()).toBe(true);
  expect(files()).toEqual([a, b]);
});
