import { FileExtension } from "../enums/fileExtension";
import { FileType } from "../enums/fileType";

export interface StorageFile {
  storageKey?: string;
  fileUrl?: string;
  fileType?: FileType;
  fileExtension?: FileExtension;
  fileName?: string;
  thumbUrl?: string;
  blurUrl?: string;
}
