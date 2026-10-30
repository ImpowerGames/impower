import { notifyFolderPathChanged } from "./folderPathChanges";
import { showSnackbar } from "./snackbar";
import { pushUndo, undo } from "./undoManager";

async function findBatchesForUris(
  projectId: string,
  uris: string[],
  sinceMs: number,
): Promise<string[]> {
  const { Workspace } = await import("../workspace/Workspace");
  const batches = await Workspace.fs.listTrash(projectId);
  const set = new Set(uris);
  return batches
    .filter(
      (b) => b.deletedAt >= sinceMs && b.entries.some((e) => set.has(e.originalUri)),
    )
    .map((b) => b.batchId);
}

async function markProjectDirty() {
  const { Workspace } = await import("../workspace/Workspace");
  await Workspace.window.recordScriptChange();
  await Workspace.window.recordAssetChange();
}

export async function recordTrashDeletion(
  projectId: string,
  deletedUris: string[],
  label: string,
  since: number,
) {
  let batchIds = await findBatchesForUris(projectId, deletedUris, since);
  if (batchIds.length === 0) {
    return;
  }
  pushUndo({
    label: `Delete ${label}`,
    undo: async () => {
      const { Workspace } = await import("../workspace/Workspace");
      for (const id of batchIds) {
        await Workspace.fs.restoreTrash(projectId, id);
      }
      await markProjectDirty();
    },
    redo: async () => {
      const redoSince = Date.now();
      const { Workspace } = await import("../workspace/Workspace");
      await Workspace.fs.deleteFiles({
        files: deletedUris.map((uri) => ({ uri })),
        mode: "trash",
      });
      batchIds = await findBatchesForUris(projectId, deletedUris, redoSince);
      await markProjectDirty();
    },
  });
  showSnackbar({
    message: `Deleted ${label}`,
    actionLabel: "Undo",
    onAction: () => void undo(),
  });
}

const basename = (p: string) => p.split("/").pop() || p;

export function recordMove(
  projectId: string,
  fromPath: string,
  toPath: string,
  isDir: boolean,
) {
  const move = async (from: string, to: string) => {
    const { Workspace } = await import("../workspace/Workspace");
    if (isDir) {
      await Workspace.fs.moveFolder(projectId, from, to);
      notifyFolderPathChanged(from, to);
    } else {
      await Workspace.fs.moveFile(projectId, from, to);
    }
    await markProjectDirty();
  };
  pushUndo({
    label: `Rename ${basename(toPath)}`,
    undo: () => move(toPath, fromPath),
    redo: () => move(fromPath, toPath),
  });
}

export function recordReferenceRename(
  projectId: string,
  fromPath: string,
  toPath: string,
) {
  const rename = async (from: string, to: string) => {
    const { Workspace } = await import("../workspace/Workspace");
    await Workspace.fs.renameFileWithReferences(projectId, from, to);
    await markProjectDirty();
  };
  pushUndo({
    label: `Rename ${basename(toPath)}`,
    undo: () => rename(toPath, fromPath),
    redo: () => rename(fromPath, toPath),
  });
}

export function recordCreate(
  projectId: string,
  createdUris: string[],
  label: string,
) {
  let batchIds: string[] = [];
  pushUndo({
    label: `Create ${label}`,
    undo: async () => {
      const since = Date.now();
      const { Workspace } = await import("../workspace/Workspace");
      await Workspace.fs.deleteFiles({
        files: createdUris.map((uri) => ({ uri })),
        mode: "trash",
      });
      batchIds = await findBatchesForUris(projectId, createdUris, since);
      await markProjectDirty();
    },
    redo: async () => {
      const { Workspace } = await import("../workspace/Workspace");
      for (const id of batchIds) {
        await Workspace.fs.restoreTrash(projectId, id);
      }
      await markProjectDirty();
    },
  });
}

export async function replaceAssetFile(
  projectId: string,
  path: string,
  data: ArrayBuffer,
  label: string,
) {
  const { Workspace } = await import("../workspace/Workspace");
  const uri = Workspace.fs.getFileUri(projectId, path);
  const oldData = await Workspace.fs.readFile({ file: { uri } });
  const write = async (bytes: ArrayBuffer) => {
    const { Workspace } = await import("../workspace/Workspace");
    await Workspace.fs.createFiles({ files: [{ uri, data: bytes.slice(0) }] });
    await markProjectDirty();
  };
  await write(data);
  pushUndo({
    label: `Replace ${label}`,
    undo: () => write(oldData),
    redo: () => write(data),
  });
  showSnackbar({
    message: `Replaced ${label}`,
    actionLabel: "Undo",
    onAction: () => void undo(),
  });
}

export async function recordResolvedUpload(
  projectId: string,
  newUris: string[],
  trashedOldUris: string[],
  since: number,
  label: string,
) {
  if (newUris.length === 0 && trashedOldUris.length === 0) {
    return;
  }
  let replacedBatchIds =
    trashedOldUris.length > 0
      ? await findBatchesForUris(projectId, trashedOldUris, since)
      : [];
  let newBatchIds: string[] = [];
  pushUndo({
    label: `Import ${label}`,
    undo: async () => {
      const { Workspace } = await import("../workspace/Workspace");
      const t = Date.now();
      if (newUris.length > 0) {
        await Workspace.fs.deleteFiles({
          files: newUris.map((uri) => ({ uri })),
          mode: "trash",
        });
        newBatchIds = await findBatchesForUris(projectId, newUris, t);
      }
      for (const id of replacedBatchIds) {
        await Workspace.fs.restoreTrash(projectId, id);
      }
      await markProjectDirty();
    },
    redo: async () => {
      const { Workspace } = await import("../workspace/Workspace");
      const t = Date.now();
      if (trashedOldUris.length > 0) {
        await Workspace.fs.deleteFiles({
          files: trashedOldUris.map((uri) => ({ uri })),
          mode: "trash",
        });
        replacedBatchIds = await findBatchesForUris(projectId, trashedOldUris, t);
      }
      for (const id of newBatchIds) {
        await Workspace.fs.restoreTrash(projectId, id);
      }
      await markProjectDirty();
    },
  });
  showSnackbar({
    message:
      newUris.length > 0
        ? `Imported ${label}`
        : `Import failed — replaced files moved to recycle bin`,
    actionLabel: "Undo",
    onAction: () => void undo(),
  });
}
