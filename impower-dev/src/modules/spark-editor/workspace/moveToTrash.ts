import { willDeleteFilesRefusal } from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";
import { NameError } from "../utils/fileListModel";
import { recordTrashDeletion } from "../utils/fileUndo";
import { keptMessage, trashSkipped } from "../utils/trashSkipped";
import type WorkspaceFileSystem from "./WorkspaceFileSystem";

export type TrashFileSystem = Pick<
  WorkspaceFileSystem,
  "getFileUri" | "deleteFiles" | "deleteFolder"
>;

export interface TrashItem {
  path: string;
  folder: boolean;
}

export async function moveToTrash(
  fs: TrashFileSystem,
  projectId: string,
  items: readonly TrashItem[],
  label: string,
): Promise<void> {
  const since = Date.now();
  const files = items.filter((item) => !item.folder);
  let uris = files.map((item) => fs.getFileUri(projectId, item.path));
  const kept: string[] = [];
  if (uris.length) {
    const skipped = new Set(
      await trashSkipped(
        fs.deleteFiles({ files: uris.map((uri) => ({ uri })), mode: "trash" }),
      ),
    );
    files.forEach((item, index) => {
      if (skipped.has(uris[index]!)) kept.push(item.path);
    });
    uris = uris.filter((uri) => !skipped.has(uri));
  }
  const deletedFolders: string[] = [];
  for (const item of items.filter((entry) => entry.folder)) {
    try {
      const deleted = await fs.deleteFolder(projectId, item.path, "trash");
      uris.push(...deleted.files.map((d) => d.uri));
      deletedFolders.push(...deleted.folders);
    } catch (error) {
      const refusal = willDeleteFilesRefusal(error);
      if (!refusal) throw error;
      uris.push(...refusal.files.map((d) => d.uri));
      kept.push(...refusal.skipped);
    }
  }
  if (uris.length || deletedFolders.length) {
    await recordTrashDeletion(projectId, uris, label, since, deletedFolders);
  }
  if (kept.length) {
    throw new NameError(keptMessage(kept));
  }
}
