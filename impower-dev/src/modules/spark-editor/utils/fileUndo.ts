import { notifyFolderPathChanged } from "./folderPathChanges";
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
      // Forward renames/moves remap their own pane inline; the undo/redo
      // inversions run here (outside any FileList), so broadcast the path
      // change to keep expanded folders open. Before markProjectDirty so the
      // remap is queued ahead of the reload that re-renders the tree.
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
 * Replace an asset's bytes IN PLACE with `data`, keeping its path (name + ext)
 * so its asset id and every `[[...]]`/reference to it still resolve. The write
 * overwrites the same path (createFiles truncates + rewrites), so the asset is
 * never momentarily absent from the tree — a trash-then-write would flicker it
 * out and, e.g., collapse the inspector selection watching it.
 *
 * Undoable by snapshotting the old bytes in the closure: undo writes them back,
 * redo re-writes the new bytes. Shows a "Replaced X · Undo" snackbar.
 */
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
    // Pass a COPY — if the worker RPC transfers the buffer it would detach the
    // snapshot we keep for a later undo/redo, leaving a zero-length write.
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
    // When nothing new was written but originals WERE trashed, this is recording
    // a failed upload so the replaced files stay undoable — say so rather than
    // claim a successful import.
    message:
      newUris.length > 0
        ? `Imported ${label}`
        : `Import failed — replaced files moved to recycle bin`,
    actionLabel: "Undo",
    onAction: () => void undo(),
  });
}
