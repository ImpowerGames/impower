import {
  FileContentType,
  FileType,
  StorageFile,
} from "../../../../../impower-core";
import {
  createFileReference,
  FileReference,
  StorageType,
} from "../../../../data";
import { InstanceData } from "../../instance/instanceData";

export interface FileData
  extends StorageFile,
    InstanceData<StorageType.File, FileReference> {
  name: string;
  folder: string;
  fileType?: FileType;

  readonly contentType?: FileContentType;
  readonly size?: number;
  readonly thumbUrl?: string;
  readonly blurUrl?: string;
  readonly updated?: string;
}

export const createFileData = (doc?: Partial<FileData>): FileData => {
  return {
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
  return data.name !== undefined && data.folder !== undefined;
};
