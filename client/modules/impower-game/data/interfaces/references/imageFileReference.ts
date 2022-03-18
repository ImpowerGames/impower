import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import { FileReference } from "./fileReference";

export interface ImageFileReference
  extends FileReference<FileTypeId.ImageFile> {
  refTypeId: FileTypeId.ImageFile;
}
