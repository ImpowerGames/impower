import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import {
  createFileReference,
  FileReference,
  isFileReference,
} from "./fileReference";

export interface TextFileReference extends FileReference<FileTypeId.TextFile> {
  refTypeId: FileTypeId.TextFile;
}

export const isTextFileReference = (obj: unknown): obj is TextFileReference => {
  if (!obj) {
    return false;
  }
  const textReference = obj as TextFileReference;
  return (
    isFileReference(obj) && textReference.refTypeId === FileTypeId.TextFile
  );
};

export const createTextFileReference = (
  obj?: Partial<TextFileReference>
): TextFileReference => ({
  ...createFileReference({ refTypeId: FileTypeId.TextFile, ...obj }),
  refTypeId: FileTypeId.TextFile,
  ...obj,
});
