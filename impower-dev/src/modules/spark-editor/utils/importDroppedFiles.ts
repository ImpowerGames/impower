import { FOLDER_SENTINEL } from "./fileTree";
import { recordResolvedUpload } from "./fileUndo";
import { runImport } from "./importProgress";
import { resolveUploadConflicts, withUploadLock } from "./uploadConflicts";

export interface DroppedItem {
  rel: string;
  getBuffer: () => Promise<ArrayBuffer>;
}

function escapeSentinel(rel: string): string {
  const slash = rel.lastIndexOf("/");
  const base = slash >= 0 ? rel.slice(slash + 1) : rel;
  if (base !== FOLDER_SENTINEL) {
    return rel;
  }
  const dir = slash >= 0 ? rel.slice(0, slash + 1) : "";
  return `${dir}_${base}`;
}

export async function importDroppedFiles(
  projectId: string,
  items: DroppedItem[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  await withUploadLock(async () => {
    const { survivors, trashedOldUris, since } = await resolveUploadConflicts(
      projectId,
      items.map((it) => ({ rel: escapeSentinel(it.rel), payload: it })),
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
  });
}
