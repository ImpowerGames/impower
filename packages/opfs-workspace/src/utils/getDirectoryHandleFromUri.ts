import { getDirectoryHandleFromPath } from "./getDirectoryHandleFromPath";
import { getPathFromUri } from "./getPathFromUri";

export const getDirectoryHandleFromUri = async (
  root: FileSystemDirectoryHandle,
  uri: string
): Promise<FileSystemDirectoryHandle> => {
  const relativePath = getPathFromUri(uri);
  return getDirectoryHandleFromPath(root, relativePath);
};
