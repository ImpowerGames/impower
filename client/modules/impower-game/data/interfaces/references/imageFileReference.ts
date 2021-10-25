import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import {
  createFileReference,
  FileReference,
  isFileReference,
} from "./fileReference";

export interface ImageFileReference
  extends FileReference<FileTypeId.ImageFile> {
  refTypeId: FileTypeId.ImageFile;
}

export const isImageFileReference = (
  obj: unknown
): obj is ImageFileReference => {
  if (!obj) {
    return false;
  }
  const imageReference = obj as ImageFileReference;
  return (
    isFileReference(obj) && imageReference.refTypeId === FileTypeId.ImageFile
  );
};

export const createImageFileReference = (
  obj?: Partial<ImageFileReference>
): ImageFileReference => ({
  ...createFileReference({ refTypeId: FileTypeId.ImageFile, ...obj }),
  refTypeId: FileTypeId.ImageFile,
  ...obj,
});
