import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import { FileReference } from "./fileReference";

export interface VideoFileReference
  extends FileReference<FileTypeId.VideoFile> {
  refTypeId: FileTypeId.VideoFile;
}
