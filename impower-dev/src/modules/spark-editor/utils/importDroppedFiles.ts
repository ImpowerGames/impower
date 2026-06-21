import { recordResolvedUpload } from "./fileUndo";
import { runImport } from "./importProgress";
import { resolveUploadConflicts } from "./uploadConflicts";

export interface DroppedItem {
  /** Target project-relative path (e.g. `assets/foo.png`, `scripts/intro.sd`). */
  rel: string;
  /** Read the bytes lazily — only survivors are read (a Skip never touches them). */
  getBuffer: () => Promise<ArrayBuffer>;
}

/**
 * Shared import pipeline for loose (non-zip) files from any source — the Upload
 * FAB, a window drop, or a drop onto a folder row. Resolves same-path conflicts
 * (Replace / Keep both / Skip), writes the survivors behind the progress bar, and
 * records ONE undoable action ("Imported X · Undo"). No-op on an empty list.
 *
 * The write/record is wrapped so the undoable action is recorded even if the
 * write throws AFTER any "Replace" originals were trashed — keeping them
 * Ctrl+Z-recoverable. Zip handling (whole-project import) stays with the caller.
 */
export async function importDroppedFiles(
  projectId: string,
  items: DroppedItem[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const { survivors, trashedOldUris, since } = await resolveUploadConflicts(
    projectId,
    items.map((it) => ({ rel: it.rel, payload: it })),
  );
  const newUris = survivors.map((s) => s.uri);
  let wrote = false;
  try {
    if (survivors.length > 0) {
      await runImport(survivors.length, async (advance) => {
        const files = await Promise.all(
          survivors.map(async (s) => {
            const data = await s.payload.getBuffer();
            advance();
            return { uri: s.uri, data };
          }),
        );
        const { Workspace } = await import("../workspace/Workspace");
        await Workspace.fs.createFiles({ files });
        // A drop can target scripts/ or assets/; signal whichever the new files
        // belong to so the compiler / asset bundle pick them up.
        if (newUris.some((u) => u.endsWith(".sd"))) {
          await Workspace.window.recordScriptChange();
        }
        await Workspace.window.recordAssetChange();
      });
      wrote = true;
    }
  } finally {
    const label =
      newUris.length === 1
        ? (newUris[0]!.split("/").pop() ?? "file")
        : `${newUris.length} files`;
    await recordResolvedUpload(
      projectId,
      wrote ? newUris : [],
      trashedOldUris,
      since,
      label,
    );
  }
}
