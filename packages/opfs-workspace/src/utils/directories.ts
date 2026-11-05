import { getDirectoryHandleFromPath } from "./getDirectoryHandleFromPath";
import { getFileName } from "./getFileName";
import { getParentPath } from "./getParentPath";

const entriesOf = async (
  directoryHandle: FileSystemDirectoryHandle,
): Promise<FileSystemHandle[]> => {
  const entries: FileSystemHandle[] = [];
  try {
    // @ts-ignore - values() method should exist
    for await (const value of directoryHandle.values()) {
      entries.push(value as FileSystemHandle);
    }
  } catch (err) {
    if (isMissingEntry(err)) {
      return [];
    }
    throw err;
  }
  return entries;
};

const isMissingEntry = (err: unknown) => {
  const name = (err as DOMException)?.name;
  return name === "NotFoundError" || name === "TypeMismatchError";
};

export const getAllFilePathsRecursive = async (
  directoryHandle: FileSystemDirectoryHandle,
  directoryPath: string,
  skipDirNames: string[] = [],
): Promise<string[]> => {
  const paths: string[] = [];
  const traverse = async (
    handle: FileSystemDirectoryHandle,
    path: string,
  ): Promise<void> => {
    for (const entry of await entriesOf(handle)) {
      const nestedPath = `${path}/${entry.name}`;
      if (entry.kind === "file") {
        paths.push(nestedPath);
      } else if (!skipDirNames.includes(entry.name)) {
        await traverse(entry as FileSystemDirectoryHandle, nestedPath);
      }
    }
  };
  await traverse(directoryHandle, directoryPath);
  return paths.sort();
};

export const getAllDirectoriesRecursive = async (
  directoryHandle: FileSystemDirectoryHandle,
  directoryPath: string,
  skipDirNames: string[] = [],
): Promise<string[]> => {
  const paths: string[] = [];
  const traverse = async (
    handle: FileSystemDirectoryHandle,
    path: string,
  ): Promise<void> => {
    for (const entry of await entriesOf(handle)) {
      if (entry.kind !== "directory" || skipDirNames.includes(entry.name)) {
        continue;
      }
      const nestedPath = `${path}/${entry.name}`;
      paths.push(nestedPath);
      await traverse(entry as FileSystemDirectoryHandle, nestedPath);
    }
  };
  await traverse(directoryHandle, directoryPath);
  return paths.sort();
};

export const createDirectory = async (
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<void> => {
  await getDirectoryHandleFromPath(root, path);
};

export const findDirectory = async (
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemDirectoryHandle | undefined> => {
  let handle = root;
  for (const name of path.split("/").filter(Boolean)) {
    try {
      handle = await handle.getDirectoryHandle(name, { create: false });
    } catch (err) {
      if (isMissingEntry(err)) {
        return undefined;
      }
      throw err;
    }
  }
  return handle;
};

const isLeftInPlace = (err: unknown): boolean => {
  const name = (err as DOMException).name;
  return name === "InvalidModificationError" || name === "NotFoundError";
};

export const deleteEmptyDirectory = async (
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<string[]> => {
  const parent = await findDirectory(root, getParentPath(path));
  const directory = parent && (await findDirectory(parent, getFileName(path)));
  if (!parent || !directory) {
    return [];
  }
  const removed: string[] = [];
  const emptyAfterPruning = async (
    handle: FileSystemDirectoryHandle,
    handlePath: string,
  ): Promise<boolean> => {
    let empty = true;
    for (const entry of await entriesOf(handle)) {
      if (entry.kind !== "directory") {
        empty = false;
        continue;
      }
      const childPath = `${handlePath}/${entry.name}`;
      if (!(await emptyAfterPruning(entry as FileSystemDirectoryHandle, childPath))) {
        empty = false;
        continue;
      }
      try {
        await handle.removeEntry(entry.name);
        removed.push(childPath);
      } catch (err) {
        if (!isLeftInPlace(err)) throw err;
        empty = false;
      }
    }
    return empty;
  };
  if (await emptyAfterPruning(directory, path)) {
    try {
      await parent.removeEntry(getFileName(path));
      removed.push(path);
    } catch (err) {
      if (!isLeftInPlace(err)) throw err;
    }
  }
  return removed;
};
