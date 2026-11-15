import { willDeleteFilesRefusal } from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";
import { NameError } from "../utils/fileListModel";
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

const leafOf = (path: string) => path.slice(path.lastIndexOf("/") + 1);

const skippedBy = async (deletion: Promise<unknown>): Promise<string[]> => {
  try {
    await deletion;
    return [];
  } catch (error) {
    const refusal = willDeleteFilesRefusal(error);
    if (!refusal) throw error;
    return refusal.skipped;
  }
};

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
      await skippedBy(
        fs.deleteFiles({ files: uris.map((uri) => ({ uri })), mode: "trash" }),
      ),
    );
    files.forEach((item, index) => {
      if (skipped.has(uris[index]!)) kept.push(leafOf(item.path));
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
      kept.push(...refusal.skipped.map(leafOf));
    }
  }
  if (uris.length || deletedFolders.length) {
    await recordTrashDeletion(projectId, uris, label, since, deletedFolders);
  }
  if (kept.length) {
    throw new NameError(
      `Couldn't move ${kept.join(", ")} to the bin. ${kept.length === 1 ? "It is" : "They are"} still where ${kept.length === 1 ? "it was" : "they were"}.`,
    );
  }
}
