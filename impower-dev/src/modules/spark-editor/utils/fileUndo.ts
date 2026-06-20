import { showSnackbar } from "./snackbar";
import { pushUndo, undo } from "./undoManager";

// The trash batch ids whose entries include any of `uris` (a single delete
// makes one batch; a bulk delete makes several).
async function findBatchesForUris(
  projectId: string,
  uris: string[],
): Promise<string[]> {
  const { Workspace } = await import("../workspace/Workspace");
  const batches = await Workspace.fs.listTrash(projectId);
  const set = new Set(uris);
  return batches
    .filter((b) => b.entries.some((e) => set.has(e.originalUri)))
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
) {
  let batchIds = await findBatchesForUris(projectId, deletedUris);
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
      const { Workspace } = await import("../workspace/Workspace");
      await Workspace.fs.deleteFiles({
        files: deletedUris.map((uri) => ({ uri })),
        mode: "trash",
      });
      // The redo lands in NEW batches — retarget so a subsequent undo restores
      // the right ones.
      batchIds = await findBatchesForUris(projectId, deletedUris);
      await markProjectDirty();
    },
  });
  showSnackbar({
    message: `Deleted ${label}`,
    actionLabel: "Undo",
    onAction: () => void undo(),
  });
}
