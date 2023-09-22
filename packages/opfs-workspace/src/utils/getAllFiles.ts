interface FileEntry {
  path: string;
  file: File;
}

export const getAllFiles = async (
  directoryHandle: FileSystemDirectoryHandle,
  directoryPath: string
): Promise<FileEntry[]> => {
  const getEntryPromises: Promise<FileEntry>[] = [];
  // @ts-ignore - values() method should exist
  const directoryIterator = directoryHandle.values();
  for await (const value of directoryIterator) {
    const handle = value as FileSystemHandle;
    const nestedPath = `${directoryPath}/${handle.name}`;
    if (handle.kind === "file") {
      const fileHandle = handle as FileSystemFileHandle;
      const getFileEntry = async () => {
        const file = await fileHandle.getFile();
        return {
          path: nestedPath,
          file,
        };
      };
      getEntryPromises.push(getFileEntry());
    }
  }
  const entries = await Promise.all(getEntryPromises);
  return entries.sort((a, b) =>
    a.path > b.path ? 1 : b.path > a.path ? -1 : 0
  );
};
