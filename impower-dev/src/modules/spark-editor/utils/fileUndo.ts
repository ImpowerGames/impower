import type WorkspaceFileSystem from "../workspace/WorkspaceFileSystem";
import { moveAll, reasonOf, reversed, type FileMove, type MovingFileSystem, type RenameOutcome } from "./fileMoves";
import { renameOrReport } from "./renameOrReport";
import { showSnackbar } from "./snackbar";
import { pushUndo, undo } from "./undoManager";

async function findBatchesForUris(
  projectId: string,
  uris: string[],
  sinceMs: number,
  folders: string[] = [],
): Promise<string[]> {
  const { Workspace } = await import("../workspace/Workspace");
  const batches = await Workspace.fs.listTrash(projectId);
  const set = new Set(uris);
  const folderSet = new Set(folders);
  return batches
    .filter(
      (b) =>
        b.deletedAt >= sinceMs &&
        (b.entries.some((e) => set.has(e.originalUri)) ||
          !!b.folders?.some((f) => folderSet.has(f))),
    )
    .map((b) => b.batchId);
}

async function restoreBatches(
  projectId: string,
  batchIds: string[],
): Promise<{ uris: string[]; folders: string[] }> {
  const { Workspace } = await import("../workspace/Workspace");
  const uris: string[] = [];
  const folders: string[] = [];
  for (const id of batchIds) {
    const restored = await Workspace.fs.restoreTrash(projectId, id);
    uris.push(...restored.files.map((f) => f.uri));
    folders.push(...restored.folders);
  }
  return { uris, folders };
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
  deletedFolders: string[] = [],
) {
  let batchIds = await findBatchesForUris(projectId, deletedUris, since, deletedFolders);
  if (batchIds.length === 0 && deletedFolders.length === 0) {
    return;
  }
  let uris = deletedUris;
  let folders = deletedFolders;
  pushUndo({
    label: `Delete ${label}`,
    undo: async () => {
      const { Workspace } = await import("../workspace/Workspace");
      const restored = await restoreBatches(projectId, batchIds);
      uris = restored.uris;
      if (restored.folders.length > 0) {
        folders = restored.folders;
      } else {
        await Workspace.fs.createFolders(projectId, folders);
      }
      await markProjectDirty();
    },
    redo: async () => {
      const redoSince = Date.now();
      const { Workspace } = await import("../workspace/Workspace");
      if (uris.length > 0 || folders.length > 0) {
        await Workspace.fs.deleteFiles({
          files: uris.map((uri) => ({ uri })),
          folders: folders.map((f) => ({
            uri: Workspace.fs.getFileUri(projectId, f),
          })),
          mode: "trash",
        });
      }
      const recorded = new Set(folders);
      const unrecorded = (await Workspace.fs.getFolders(projectId)).filter(
        (f) => !recorded.has(f) && folders.some((r) => f.startsWith(`${r}/`)),
      );
      await Workspace.fs.deleteFolders(
        projectId,
        folders.filter((r) => !unrecorded.some((f) => f.startsWith(`${r}/`))),
      );
      batchIds = await findBatchesForUris(projectId, uris, redoSince, folders);
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

const folderOf = (path: string) => path.slice(0, path.lastIndexOf("/") + 1);

export type FileRenamer = {
  fs: MovingFileSystem &
    Pick<WorkspaceFileSystem, "renameFileWithReferences" | "renameFilesWithReferences">;
  autoRenameFiles: () => boolean;
};

export async function renameFiles(
  workspace: FileRenamer,
  projectId: string,
  moves: readonly FileMove[],
): Promise<RenameOutcome> {
  const follows =
    moves.every((move) => !move.isDir && folderOf(move.from) === folderOf(move.to)) &&
    workspace.autoRenameFiles();
  const [only] = moves;
  if (moves.length === 1 && only) {
    if (follows) {
      const result = await workspace.fs.renameFileWithReferences(projectId, only.from, only.to);
      return { referencesUpdated: result.referencesUpdated, also: [] };
    }
    if (only.isDir) await workspace.fs.moveFolder(projectId, only.from, only.to);
    else await workspace.fs.moveFile(projectId, only.from, only.to);
    return { referencesUpdated: 0, also: [] };
  }
  return follows
    ? workspace.fs.renameFilesWithReferences(projectId, moves)
    : moveAll(workspace.fs, projectId, moves);
}

export async function renameFile(
  workspace: FileRenamer,
  projectId: string,
  fromPath: string,
  toPath: string,
): Promise<{ referencesUpdated: number }> {
  return renameFiles(workspace, projectId, [{ from: fromPath, to: toPath }]);
}

export function recordMoves(
  projectId: string,
  moves: readonly FileMove[],
  label: string,
  verb: "Rename" | "Move" = "Rename",
) {
  const run = async (set: readonly FileMove[]) => {
    const { Workspace } = await import("../workspace/Workspace");
    const [only] = set;
    if (set.length === 1 && only) {
      const move = await renameOrReport<unknown>(only.from, only.to, () =>
        renameFiles(Workspace, projectId, set),
      );
      if (!move.renamed) {
        throw new Error(`Rename of ${only.from} to ${only.to} was refused`);
      }
    } else {
      try {
        await renameFiles(Workspace, projectId, set);
      } catch (error) {
        showSnackbar({ message: reasonOf(error) });
        throw error;
      }
    }
    await markProjectDirty();
  };
  const all = [...moves];
  pushUndo({
    label: `${verb} ${label}`,
    undo: () => run(reversed(all)),
    redo: () => run(all),
  });
}

export function recordMove(
  projectId: string,
  fromPath: string,
  toPath: string,
  isDir: boolean,
) {
  recordMoves(projectId, [{ from: fromPath, to: toPath, isDir }], basename(toPath));
}

export function recordCreate(
  projectId: string,
  createdUris: string[],
  label: string,
) {
  let batchIds: string[] = [];
  let uris = createdUris;
  pushUndo({
    label: `Create ${label}`,
    undo: async () => {
      const since = Date.now();
      const { Workspace } = await import("../workspace/Workspace");
      await Workspace.fs.deleteFiles({
        files: uris.map((uri) => ({ uri })),
        mode: "trash",
      });
      batchIds = await findBatchesForUris(projectId, uris, since);
      await markProjectDirty();
    },
    redo: async () => {
      uris = (await restoreBatches(projectId, batchIds)).uris;
      await markProjectDirty();
    },
  });
}

export const REPLACED_MESSAGE = "Replaced. Every line that shows it now uses the new file.";

export function recordReplace({
  label,
  message,
  undo: restoreOld,
  redo: restoreNew,
}: {
  label: string;
  message: string;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}) {
  pushUndo({
    label: `Replace ${label}`,
    undo: restoreOld,
    redo: restoreNew,
  });
  showSnackbar({
    message,
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
  let added = newUris;
  let replaced = trashedOldUris;
  pushUndo({
    label: `Import ${label}`,
    undo: async () => {
      const { Workspace } = await import("../workspace/Workspace");
      const t = Date.now();
      if (added.length > 0) {
        await Workspace.fs.deleteFiles({
          files: added.map((uri) => ({ uri })),
          mode: "trash",
        });
        newBatchIds = await findBatchesForUris(projectId, added, t);
      }
      replaced = (await restoreBatches(projectId, replacedBatchIds)).uris;
      await markProjectDirty();
    },
    redo: async () => {
      const { Workspace } = await import("../workspace/Workspace");
      const t = Date.now();
      if (replaced.length > 0) {
        await Workspace.fs.deleteFiles({
          files: replaced.map((uri) => ({ uri })),
          mode: "trash",
        });
        replacedBatchIds = await findBatchesForUris(projectId, replaced, t);
      }
      added = (await restoreBatches(projectId, newBatchIds)).uris;
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
