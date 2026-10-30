import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ZipFilesMethod = typeof ZipFilesMessage.method;

export interface ZipFilesParams {
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
