import { layoutSubtreeFor, routeIntoLayout } from "./fileTree";
import { recordResolvedUpload } from "./fileUndo";
import { runImport } from "./importProgress";
import { isScriptPath } from "./scriptFiles";
import { resolveUploadConflicts } from "./uploadConflicts";

export interface DroppedItem {
  rel: string;
  getBuffer: () => Promise<ArrayBuffer>;
}

export async function importFiles(
  projectId: string,
  items: DroppedItem[],
): Promise<string[]> {
  const written: string[] = [];
  if (items.length === 0) {
    return written;
  }
  const { Workspace } = await import("../workspace/Workspace");
  await resolveUploadConflicts(
    projectId,
    items.map((it) => ({ rel: it.rel, payload: it })),
    async ({ survivors, trashedOldUris, since }) => {
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
            await Workspace.fs.createFiles({ files });
            if (newUris.some(isScriptPath)) {
              await Workspace.window.recordScriptChange();
            }
            await Workspace.window.recordAssetChange();
          });
          wrote = true;
          written.push(
            ...newUris.map((uri) => Workspace.fs.getRelativePath(projectId, uri)),
          );
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
    },
  );
  return written;
}

export async function importDroppedFiles(
  projectId: string,
  items: DroppedItem[],
): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const { Workspace } = await import("../workspace/Workspace");
  const existingPaths = Object.keys(await Workspace.fs.getFiles(projectId)).map(
    (uri) => Workspace.fs.getRelativePath(projectId, uri),
  );
  const routed = routeIntoLayout(
    items.map((it) => it.rel),
    existingPaths,
    layoutSubtreeFor,
  );
  await importFiles(
    projectId,
    items.map((it, i) => ({ ...it, rel: routed[i]! })),
  );
}
