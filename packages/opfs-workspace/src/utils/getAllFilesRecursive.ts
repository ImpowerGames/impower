interface FileEntry {
  path: string;
  file: File;
}

export const getAllFilesRecursive = async (
  directoryHandle: FileSystemDirectoryHandle,
  directoryPath: string
): Promise<FileEntry[]> => {
  const getEntryPromises: Promise<FileEntry>[] = [];
  const traverse = async (
    directoryHandle: FileSystemDirectoryHandle,
    directoryPath: string
  ) => {
    // @ts-ignore - values() method should exist
    const directoryIterator = directoryHandle.values();
    for await (const value of directoryIterator) {
      const handle = value as FileSystemHandle;
      const nestedPath = `${directoryPath}/${handle.name}`;
      if (handle.kind === "file") {
        const fileHandle = handle as FileSystemFileHandle;
        const getFileEntry = async (): Promise<FileEntry> => {
          const file = await fileHandle.getFile();
          const fileEntry: FileEntry = {
            path: nestedPath,
            file,
          };
          return fileEntry;
        };
        getEntryPromises.push(getFileEntry());
      } else if (handle.kind === "directory") {
        const directoryHandle = handle as FileSystemDirectoryHandle;
        await traverse(directoryHandle, nestedPath);
      }
    }
  };
  await traverse(directoryHandle, directoryPath);
  const entries = await Promise.all(getEntryPromises);
  return entries.sort((a, b) =>
    a.path > b.path ? 1 : b.path > a.path ? -1 : 0
  );
};
