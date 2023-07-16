import { getDirectoryHandleFromPath } from "./getDirectoryHandleFromPath";
import { getFileName } from "./getFileName";
import { getParentPath } from "./getParentPath";

export const getFileHandleFromPath = async (
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle> => {
  const directoryPath = getParentPath(relativePath);
  const fileName = getFileName(relativePath);
  const directoryHandle = await getDirectoryHandleFromPath(root, directoryPath);
  return await directoryHandle.getFileHandle(fileName, { create: true });
};
