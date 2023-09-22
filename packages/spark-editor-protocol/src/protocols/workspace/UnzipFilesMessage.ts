import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type UnzipFilesMethod = typeof UnzipFilesMessage.method;

export interface UnzipFilesParams {
  data: ArrayBuffer;
}

export class UnzipFilesMessage {
  static readonly method = "workspace/unzipFiles";
  static readonly type = new MessageProtocolRequestType<
    UnzipFilesMethod,
    UnzipFilesParams,
    { filename: string; data: ArrayBuffer }[]
  >(UnzipFilesMessage.method);
}
