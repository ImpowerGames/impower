import { getFileHandleFromPath } from "./getFileHandleFromPath";
import { getPathFromUri } from "./getPathFromUri";

export const getSyncAccessHandleFromUri = async (
  root: FileSystemDirectoryHandle,
  uri: string
): Promise<FileSystemSyncAccessHandle> => {
  const relativePath = getPathFromUri(uri);
  const fileHandle = await getFileHandleFromPath(root, relativePath);
  return fileHandle.createSyncAccessHandle();
};
