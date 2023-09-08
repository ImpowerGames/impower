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

export namespace WillWriteFileMessage {
  export const method = "workspace/willWriteFile";
  export const type = new MessageProtocolRequestType<
    WillWriteFileMethod,
    WillWriteFileParams,
    FileData
  >(WillWriteFileMessage.method);
}
