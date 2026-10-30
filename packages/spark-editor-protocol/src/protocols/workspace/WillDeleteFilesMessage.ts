import { DeleteFilesParams, FileData } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillDeleteFilesMethod = typeof WillDeleteFilesMessage.method;

export interface WillDeleteFilesParams extends DeleteFilesParams {
  mode?: "trash" | "permanent";
}

export class WillDeleteFilesMessage {
  static readonly method = "workspace/willDeleteFiles";
  static readonly type = new MessageProtocolRequestType<
    WillDeleteFilesMethod,
    WillDeleteFilesParams,
    FileData[]
  >(WillDeleteFilesMessage.method);
}
