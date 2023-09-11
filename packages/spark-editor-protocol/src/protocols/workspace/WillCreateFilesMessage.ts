import { CreateFilesParams, FileCreate, FileData } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillCreateFilesMethod = typeof WillCreateFilesMessage.method;

export interface WillCreateFilesParams extends CreateFilesParams {
  files: (FileCreate & { data: ArrayBuffer })[];
}

export class WillCreateFilesMessage {
  static readonly method = "workspace/willCreateFiles";
  static readonly type = new MessageProtocolRequestType<
    WillCreateFilesMethod,
    WillCreateFilesParams,
    FileData[]
  >(WillCreateFilesMessage.method);
}
