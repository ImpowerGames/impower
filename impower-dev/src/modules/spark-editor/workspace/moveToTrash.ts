import { recordTrashDeletion } from "../utils/fileUndo";
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
  const uris = items
    .filter((item) => !item.folder)
    .map((item) => fs.getFileUri(projectId, item.path));
  if (uris.length) {
    await fs.deleteFiles({ files: uris.map((uri) => ({ uri })), mode: "trash" });
  }
  const deletedFolders: string[] = [];
  for (const item of items.filter((entry) => entry.folder)) {
    const deleted = await fs.deleteFolder(projectId, item.path, "trash");
    uris.push(...deleted.files.map((d) => d.uri));
    deletedFolders.push(...deleted.folders);
  }
  await recordTrashDeletion(projectId, uris, label, since, deletedFolders);
}
