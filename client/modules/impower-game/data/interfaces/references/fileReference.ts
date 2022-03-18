import { FileTypeId } from "../../../project/classes/instances/file/fileTypeId";
import { Reference } from "../reference";

export interface FileReference<T extends FileTypeId = FileTypeId>
  extends Reference<"File"> {
  refType: "File";
  refTypeId: T;
}
