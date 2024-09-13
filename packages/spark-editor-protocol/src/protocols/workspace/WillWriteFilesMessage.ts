import { FileData } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillWriteFilesMethod = typeof WillWriteFilesMessage.method;

export interface WillWriteFilesParams {
  files: {
    uri: string;
    version: number;
    data: ArrayBuffer;
  }[];
}

export class WillWriteFilesMessage {
  static readonly method = "workspace/willWriteFiles";
  static readonly type = new MessageProtocolRequestType<
    WillWriteFilesMethod,
    WillWriteFilesParams,
    FileData[]
  >(WillWriteFilesMessage.method);
}
