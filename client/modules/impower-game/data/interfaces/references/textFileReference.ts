import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import { FileReference } from "./fileReference";

export interface TextFileReference extends FileReference<FileTypeId.TextFile> {
  refTypeId: FileTypeId.TextFile;
}
