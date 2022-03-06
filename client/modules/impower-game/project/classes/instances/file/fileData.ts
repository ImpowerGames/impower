import { FileContentType, StorageFile } from "../../../../../impower-core";
import { createFileReference, FileReference } from "../../../../data";
import { InstanceData } from "../../instance/instanceData";

export interface FileData
  extends StorageFile,
    InstanceData<"File", FileReference> {
  name: string;
  folder: string;
  fileType?: string;

  readonly contentType?: FileContentType;
  readonly size?: number;
  readonly thumbUrl?: string;
  readonly blurUrl?: string;
  readonly updated?: string;
}

export const createFileData = (doc?: Partial<FileData>): FileData => {
  return {
    pos: -1,
    line: -1,
    reference: createFileReference(),
    name: "",
    storageKey: "",
    folder: "",
    ...doc,
  };
};

export const isFileData = (obj: unknown): obj is FileData => {
  if (!obj) {
    return false;
  }
  const data = obj as FileData;
  return data.storageKey !== undefined && data.contentType !== undefined;
};
