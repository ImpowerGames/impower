import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ZipFilesMethod = typeof ZipFilesMessage.method;

export interface ZipFilesParams {
  /**
   * The files that should be zipped.
   */
  files: { uri: string }[];
}

export class ZipFilesMessage {
  static readonly method = "workspace/zipFiles";
  static readonly type = new MessageProtocolRequestType<
    ZipFilesMethod,
    ZipFilesParams,
    ArrayBuffer
  >(ZipFilesMessage.method);
}
