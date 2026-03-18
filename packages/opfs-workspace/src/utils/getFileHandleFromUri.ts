import { getFileHandleFromPath } from "./getFileHandleFromPath";
import { getPathFromUri } from "./getPathFromUri";

export const getFileHandleFromUri = async (
  root: FileSystemDirectoryHandle,
  uri: string,
  create: boolean,
): Promise<FileSystemFileHandle> => {
  const relativePath = getPathFromUri(uri);
  return getFileHandleFromPath(root, relativePath, create);
};
