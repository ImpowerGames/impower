export const getDirectoryPathHandle = async (
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemDirectoryHandle> => {
  const path = relativePath.startsWith(".")
    ? relativePath.slice(1)
    : relativePath;
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i += 1) {
    const name = parts[i]!;
    rootHandle = await rootHandle.getDirectoryHandle(name, {
      create: true,
    });
  }
  return rootHandle;
};
