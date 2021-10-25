import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import {
  createFileReference,
  FileReference,
  isFileReference,
} from "./fileReference";

export interface VideoFileReference
  extends FileReference<FileTypeId.VideoFile> {
  refTypeId: FileTypeId.VideoFile;
}

export const isVideoFileReference = (
  obj: unknown
): obj is VideoFileReference => {
  if (!obj) {
    return false;
  }
  const videoReference = obj as VideoFileReference;
  return (
    isFileReference(obj) && videoReference.refTypeId === FileTypeId.VideoFile
  );
};

export const createVideoFileReference = (
  obj?: Partial<VideoFileReference>
): VideoFileReference => ({
  ...createFileReference({ refTypeId: FileTypeId.VideoFile, ...obj }),
  refTypeId: FileTypeId.VideoFile,
  ...obj,
});
