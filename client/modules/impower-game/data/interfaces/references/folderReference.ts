import { isReference, Reference } from "../reference";
import { StorageType } from "../../enums/data";

export interface FolderReference extends Reference<StorageType.Folder> {
  refType: StorageType.Folder;
  refTypeId: StorageType.Folder;
}

export const isFolderReference = (obj: unknown): obj is FolderReference => {
  if (!obj) {
    return false;
  }
  const folderReference = obj as FolderReference;
  return isReference(obj) && folderReference.refType === StorageType.Folder;
};

export const createFolderReference = (
  obj?: Partial<FolderReference>
): FolderReference => ({
  refType: StorageType.Folder,
  refTypeId: StorageType.Folder,
  refId: "",
  ...obj,
});
