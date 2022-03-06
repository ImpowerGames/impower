import { FileContentType, StorageFile } from "../../../../../impower-core";

export interface FileData extends StorageFile, Record<string, unknown> {
  readonly contentType?: FileContentType;
  readonly size?: number;
}
