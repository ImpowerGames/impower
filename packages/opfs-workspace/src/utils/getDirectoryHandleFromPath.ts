export const getDirectoryHandleFromPath = async (
  root: FileSystemDirectoryHandle,
  relativePath: string
): Promise<FileSystemDirectoryHandle> => {
  const path = relativePath.startsWith("./")
    ? relativePath.slice(2)
    : relativePath.startsWith("/")
    ? relativePath.slice(1)
    : relativePath;
  const parts = path.split("/");
  for (let i = 0; i < parts.length; i += 1) {
    const name = parts[i]!;
    root = await root.getDirectoryHandle(name, {
      create: true,
    });
  }
  return root;
};
