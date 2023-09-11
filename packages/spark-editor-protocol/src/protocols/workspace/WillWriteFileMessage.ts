import { FileData } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillWriteFileMethod = typeof WillWriteFileMessage.method;

export interface WillWriteFileParams {
  file: {
    uri: string;
    version: number;
    data: ArrayBuffer;
  };
}

export class WillWriteFileMessage {
  static readonly method = "workspace/willWriteFile";
  static readonly type = new MessageProtocolRequestType<
    WillWriteFileMethod,
    WillWriteFileParams,
    FileData
  >(WillWriteFileMessage.method);
}
