import { FileContentType } from "../../../../data/enums/FileContentType";

export interface FileData extends Record<string, unknown> {
  readonly contentType?: FileContentType;
  readonly size?: number;
  storageKey?: string;
  fileUrl?: string;
  fileType?: string;
  fileExtension?: string;
  fileName?: string;
  fileId?: string;
  project?: string;
  name?: string;
  thumbUrl?: string;
  blurUrl?: string;
  a?: {
    u?: string;
    i?: string;
    h?: string;
  };
  t?: number;
}
