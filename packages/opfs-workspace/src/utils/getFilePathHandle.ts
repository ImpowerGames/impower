import { getDirectoryPathHandle } from "./getDirectoryPathHandle";
import { getFileName } from "./getFileName";
import { getParentPath } from "./getParentPath";

export const getFilePathHandle = async (
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemFileHandle> => {
  const directoryPath = getParentPath(relativePath);
  const fileName = getFileName(relativePath);
  const directoryHandle = await getDirectoryPathHandle(
    rootHandle,
    directoryPath
  );
  return await directoryHandle.getFileHandle(fileName, { create: true });
};
