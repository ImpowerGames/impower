import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import {
  createFileReference,
  FileReference,
  isFileReference,
} from "./fileReference";

export interface AudioFileReference
  extends FileReference<FileTypeId.AudioFile> {
  refTypeId: FileTypeId.AudioFile;
}

export const isAudioFileReference = (
  obj: unknown
): obj is AudioFileReference => {
  if (!obj) {
    return false;
  }
  const audioReference = obj as AudioFileReference;
  return (
    isFileReference(obj) && audioReference.refTypeId === FileTypeId.AudioFile
  );
};

export const createAudioFileReference = (
  obj?: Partial<AudioFileReference>
): AudioFileReference => ({
  ...createFileReference({ refTypeId: FileTypeId.AudioFile, ...obj }),
  refTypeId: FileTypeId.AudioFile,
  ...obj,
});
