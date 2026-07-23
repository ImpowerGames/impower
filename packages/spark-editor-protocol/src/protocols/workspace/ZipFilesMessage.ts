import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ZipFilesMethod = typeof ZipFilesMessage.method;

export interface ZipFilesParams {
  /**
   * The files that should be zipped.
   *
   * `path` is the project-relative archive path for the entry (e.g.
   * `backgrounds/forest.png`); it preserves folder structure in the zip. When
   * omitted, the file's bare basename is used (legacy/flat behavior).
   */
  files: { uri: string; path?: string }[];
}

export class ZipFilesMessage {
  static readonly method = "workspace/zipFiles";
  static readonly type = new MessageProtocolRequestType<
    ZipFilesMethod,
    ZipFilesParams,
    ArrayBuffer
  >(ZipFilesMessage.method);
}
