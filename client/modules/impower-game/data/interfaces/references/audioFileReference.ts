import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import { FileReference } from "./fileReference";

export interface AudioFileReference
  extends FileReference<FileTypeId.AudioFile> {
  refTypeId: FileTypeId.AudioFile;
}
