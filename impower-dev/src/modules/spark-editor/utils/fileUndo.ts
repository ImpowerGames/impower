import { showSnackbar } from "./snackbar";
import { pushUndo, undo } from "./undoManager";

// The trash batch ids created at/after `sinceMs` whose entries include any of
// `uris` (a single delete makes one batch; a bulk delete makes several). The
// `sinceMs` floor is essential: the same originalUri can live in an OLDER batch
// (delete X -> recreate X -> delete X), and an undo must target only the batch
// THIS delete just produced, never the stale older one.
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

/**
 * Call AFTER a trash-delete completes: locates the resulting batch(es), records
 * a reversible undo action (Ctrl+Z restores; redo re-deletes into a fresh
 * batch), and shows a "Deleted X · Undo" snackbar. No-op if the delete didn't
 * trash anything (e.g. nothing matched).
 */
export async function recordTrashDeletion(
  projectId: string,
  deletedUris: string[],
  label: string,
  // Captured by the caller just BEFORE the delete, so we only pick up the
  // batch(es) THIS delete produced (not an older same-path batch).
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
      // The redo lands in NEW batches — retarget so a subsequent undo restores
      // the right ones.
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

/**
 * Record a plain rename/move (no reference rewrite) as reversible. Undo moves
 * it back; redo re-applies. `isDir` picks moveFolder vs moveFile.
 */
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

/**
 * Record a reference-aware rename as reversible. A rename-with-references is its
 * own inverse — renaming back rewrites the references back too.
 */
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

/**
 * Record a create (new file/folder, upload, url) as reversible. Undo moves the
 * created file(s) to trash (so it stays recoverable even after undo); redo
 * restores them.
 */
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

/**
 * Record a conflict-resolved UPLOAD as ONE undoable action + an "Imported X ·
 * Undo" snackbar: undo trashes the newly-written files AND restores any
 * originals that "Replace" moved to trash (their paths free up once the new
 * files are trashed); redo re-applies. `since` is the timestamp captured just
 * before the replace-trash, used to locate those originals' batch(es).
 */
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
      // Trash the new files first (frees their paths), then restore the
      // originals they replaced.
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
      // Re-trash the originals, then restore the uploaded files.
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
    message: `Imported ${label}`,
    actionLabel: "Undo",
    onAction: () => void undo(),
  });
}
