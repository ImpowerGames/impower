import { CreateFilesParams, FileCreate, FileData } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillCreateFilesMethod = typeof WillCreateFilesMessage.method;

export interface WillCreateFilesParams extends CreateFilesParams {
  files: (FileCreate & { data: ArrayBuffer })[];
}

export namespace WillCreateFilesMessage {
  export const method = "workspace/willCreateFiles";
  export const type = new MessageProtocolRequestType<
    WillCreateFilesMethod,
    WillCreateFilesParams,
    FileData[]
  >(WillCreateFilesMessage.method);
}
