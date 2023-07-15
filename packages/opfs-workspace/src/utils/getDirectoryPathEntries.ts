interface FileEntry {
  uri: string;
  name: string;
  kind: "file";
  size: number;
  type: string;
  lastModified: number;
  handle: FileSystemFileHandle;
}

interface DirectoryEntry {
  uri: string;
  name: string;
  kind: "directory";
  entries: Record<string, FileEntry | DirectoryEntry>;
  handle: FileSystemDirectoryHandle;
}

export const getDirectoryPathEntries = async (
  directoryHandle: FileSystemDirectoryHandle,
  directoryPath: string
) => {
  const fileHandles = [];
  const directoryHandles = [];
  const entries: Record<string, FileEntry | DirectoryEntry> = {};
  // Get an iterator of the files and folders in the directory.
  // @ts-ignore - values() method should exist
  const directoryIterator = directoryHandle.values();
  const directoryEntryPromises = [];
  for await (const value of directoryIterator) {
    const handle = value as FileSystemHandle;
    const nestedPath = `${directoryPath}/${handle.name}`;
    if (handle.kind === "file") {
      const fileHandle = handle as FileSystemFileHandle;
      fileHandles.push({ handle: fileHandle, nestedPath });
      directoryEntryPromises.push(
        fileHandle.getFile().then((file) => {
          return {
            name: fileHandle.name,
            kind: fileHandle.kind,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
            uri: nestedPath,
            handle: fileHandle,
          };
        })
      );
    } else if (handle.kind === "directory") {
      const directoryHandle = handle as FileSystemDirectoryHandle;
      directoryHandles.push({ handle: directoryHandle, nestedPath });
      directoryEntryPromises.push(
        (async () => {
          return {
            name: directoryHandle.name,
            kind: directoryHandle.kind,
            uri: nestedPath,
            entries: await getDirectoryPathEntries(directoryHandle, nestedPath),
            handle: directoryHandle,
          };
        })()
      );
    }
  }
  const directoryEntries = await Promise.all(directoryEntryPromises);
  directoryEntries.forEach((directoryEntry) => {
    entries[directoryEntry.name] = directoryEntry;
  });
  return entries;
};
