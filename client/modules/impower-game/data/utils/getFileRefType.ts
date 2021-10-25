import { FileType } from "../../../impower-core";
import { FileTypeId } from "../../project/classes/instances/file/fileTypeId";

export const getFileRefType = (type: FileType): FileTypeId => {
  if (type?.toLowerCase().startsWith("image")) {
    return FileTypeId.ImageFile;
  }
  if (type?.toLowerCase().startsWith("audio")) {
    return FileTypeId.AudioFile;
  }
  if (type?.toLowerCase().startsWith("video")) {
    return FileTypeId.VideoFile;
  }
  if (type?.toLowerCase().startsWith("test")) {
    return FileTypeId.TextFile;
  }
  return undefined;
};
