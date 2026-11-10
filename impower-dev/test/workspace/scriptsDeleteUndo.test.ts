import { beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT = "p";
const uri = (path: string) => `file:///${PROJECT}/${path}`;
const relative = (u: string) => u.slice(`file:///${PROJECT}/`.length);

type Batch = { batchId: string; deletedAt: number; entries: { relPath: string; originalUri: string; type: string }[] };

const disk = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  trash: [] as Batch[],
  restored: new Map<string, Map<string, string>>(),
}));

const fs = vi.hoisted(() => ({
  getFiles: async () =>
    Object.fromEntries(
      [...disk.files.keys()].map((p) => [uri(p), { uri: uri(p), size: disk.files.get(p)!.length, modified: 1 }]),
    ),
  getFolders: async () => [...disk.dirs].sort(),
  getFileUri: (_: string, path: string) => uri(path),
  getRelativePath: (_: string, u: string) => relative(u),
  deleteFiles: async ({ files }: { files: { uri: string }[] }) => {
    const held = new Map<string, string>();
    const batch: Batch = { batchId: `b${disk.trash.length + 1}`, deletedAt: Date.now(), entries: [] };
    for (const { uri: u } of files) {
      const path = relative(u);
      held.set(path, disk.files.get(path)!);
      disk.files.delete(path);
      batch.entries.push({ relPath: path, originalUri: u, type: "script" });
    }
    disk.trash.push(batch);
    disk.restored.set(batch.batchId, held);
    return files.map(({ uri: u }) => ({ uri: u }));
  },
  deleteFolder: async (_: string, folder: string) => {
    const inside = [...disk.files.keys()].filter((p) => p.startsWith(`${folder}/`));
    const deleted = inside.length ? await fs.deleteFiles({ files: inside.map((p) => ({ uri: uri(p) })) }) : [];
    const folders = [...disk.dirs].filter((d) => d === folder || d.startsWith(`${folder}/`));
    for (const d of folders) disk.dirs.delete(d);
    return { files: deleted, folders };
  },
  listTrash: async () => [...disk.trash],
  restoreTrash: async (_: string, batchId: string) => {
    for (const [path, text] of disk.restored.get(batchId)!) {
      disk.files.set(path, text);
      for (let d = path.slice(0, path.lastIndexOf("/")); d; d = d.includes("/") ? d.slice(0, d.lastIndexOf("/")) : "") {
        disk.dirs.add(d);
      }
    }
    disk.trash = disk.trash.filter((b) => b.batchId !== batchId);
    return [];
  },
  createFolders: async (_: string, folders: string[]) => {
    for (const d of folders) disk.dirs.add(d);
    return folders;
  },
  deleteFolders: async (_: string, folders: string[]) => {
    for (const d of folders) disk.dirs.delete(d);
    return folders;
  },
}));

const window = vi.hoisted(() => ({
  recordScriptChange: async () => undefined,
  recordAssetChange: async () => undefined,
  openFileEditor: () => undefined,
  getActiveEditorForFile: () => undefined,
}));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs, window },
}));

const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { default: WorkspaceScripts } = await import("../../src/modules/spark-editor/workspace/WorkspaceScripts");
const { snackbar } = await import("../../src/modules/spark-editor/utils/snackbar");
const { clearUndoHistory } = await import("../../src/modules/spark-editor/utils/undoManager");

const scripts = new WorkspaceScripts({
  fs,
  ls: { getScriptReferences: async () => [] },
  window,
} as never);

const press = async (label: string) => {
  const toast = snackbar.value!;
  expect(toast.actionLabel).toBe(label);
  toast.onAction!();
  await vi.waitFor(() => expect(disk.trash).toHaveLength(0));
};

beforeEach(async () => {
  disk.files = new Map(
    ["main.sd", "Scripts/intro.sd", "Scripts/Drafts/old.sd", "Scripts/Drafts/Old/older.sd"].map((p) => [p, `text of ${p}`]),
  );
  disk.dirs = new Set(["Scripts", "Scripts/Drafts", "Scripts/Drafts/Old", "Scripts/Empty"]);
  disk.trash = [];
  disk.restored = new Map();
  clearUndoHistory();
  snackbar.value = null;
  workspace.current = {
    ...workspace.current,
    project: { ...workspace.current.project, id: PROJECT },
  };
  await scripts.load();
});

describe("deleting scripts with Undo", () => {
  it("sends a script to the recycle bin with a Deleted toast whose Undo returns it to its folder", async () => {
    await scripts.remove(["Scripts/Drafts/old.sd"]);
    expect(disk.files.has("Scripts/Drafts/old.sd")).toBe(false);
    expect(disk.trash).toHaveLength(1);
    expect(snackbar.value!.message).toBe("Deleted old.sd");
    await press("Undo");
    expect(disk.files.get("Scripts/Drafts/old.sd")).toBe("text of Scripts/Drafts/old.sd");
  });

  it("deletes several picked items as one step, one toast and one Undo that returns each to its own folder", async () => {
    await scripts.remove(["Scripts/intro.sd", "Scripts/Drafts", "Scripts/Empty"]);
    expect([...disk.files.keys()]).toEqual(["main.sd"]);
    expect(disk.dirs.has("Scripts/Empty")).toBe(false);
    expect(snackbar.value!.message).toBe("Deleted 3 items");
    await press("Undo");
    expect([...disk.files.keys()].sort()).toEqual([
      "Scripts/Drafts/Old/older.sd",
      "Scripts/Drafts/old.sd",
      "Scripts/intro.sd",
      "main.sd",
    ]);
    expect(disk.dirs.has("Scripts/Empty")).toBe(true);
  });

  it("says how many scripts went when every picked item is a script", async () => {
    await scripts.remove(["Scripts/intro.sd", "Scripts/Drafts/old.sd"]);
    expect(snackbar.value!.message).toBe("Deleted 2 scripts");
  });

  it("never deletes Main, even among several", async () => {
    await expect(scripts.remove(["Scripts/intro.sd", "main.sd"])).rejects.toThrow("Main stays");
    expect(disk.files.has("Scripts/intro.sd")).toBe(true);
  });
});
