import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import { isReference, Reference } from "../reference";

export interface FileReference<T extends FileTypeId = FileTypeId>
  extends Reference<"File"> {
  refType: "File";
  refTypeId: T;
}

export const isFileReference = <T extends FileTypeId = FileTypeId>(
  obj: unknown
): obj is FileReference<T> => {
  if (!obj) {
    return false;
  }
  const fileReference = obj as FileReference<T>;
  return isReference(obj) && fileReference.refType === "File";
};

export const createFileReference = <T extends FileTypeId = FileTypeId>(
  obj?: Partial<FileReference<T>> & Pick<FileReference<T>, "refTypeId">
): FileReference<T> => ({
  refType: "File",
  refTypeId: "",
  refId: "",
  ...obj,
});
