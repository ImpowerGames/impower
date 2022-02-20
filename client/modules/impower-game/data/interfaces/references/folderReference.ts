import { isReference, Reference } from "../reference";

export interface FolderReference extends Reference<"Folder"> {
  refType: "Folder";
  refTypeId: "Folder";
}

export const isFolderReference = (obj: unknown): obj is FolderReference => {
  if (!obj) {
    return false;
  }
  const folderReference = obj as FolderReference;
  return isReference(obj) && folderReference.refType === "Folder";
};

export const createFolderReference = (
  obj?: Partial<FolderReference>
): FolderReference => ({
  refType: "Folder",
  refTypeId: "Folder",
  refId: "",
  ...obj,
});
