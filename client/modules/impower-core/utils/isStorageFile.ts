import { StorageFile } from "../types/interfaces/storageFile";

const isStorageFile = (obj: unknown): obj is StorageFile => {
  if (!obj) {
    return false;
  }
  const file = obj as StorageFile;
  return file.storageKey !== undefined;
};

export default isStorageFile;
