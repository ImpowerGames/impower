import { createFolderReference, FolderReference } from "../../../../data";
import { InstanceData } from "../../instance/instanceData";

export interface FolderData extends InstanceData<"Folder", FolderReference> {
  name: string;
  parent: string;
  children: string[];

  readonly size?: number;
}

export const createFolderData = (doc?: Partial<FolderData>): FolderData => {
  return {
    reference: createFolderReference(),
    name: "New Folder",
    parent: "",
    children: [],
    ...doc,
  };
};

export const isFolderData = (obj: unknown): obj is FolderData => {
  if (!obj) {
    return false;
  }
  const data = obj as FolderData;
  return (
    data.name !== undefined &&
    data.parent !== undefined &&
    data.children !== undefined
  );
};
