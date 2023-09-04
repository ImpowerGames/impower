import { DeleteFilesParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type WillDeleteFilesMethod = typeof WillDeleteFilesMessage.method;

export interface WillDeleteFilesParams extends DeleteFilesParams {}

export namespace WillDeleteFilesMessage {
  export const method = "workspace/willDeleteFiles";
  export const type = new MessageProtocolRequestType<
    WillDeleteFilesMethod,
    WillDeleteFilesParams,
    null
  >(WillDeleteFilesMessage.method);
}
