import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type RenameSaveMethod = typeof RenameSaveMessage.method;

export interface RenameSaveParams {
  id: string;
  name: string;
}

export interface RenameSaveResult {}

export class RenameSaveMessage {
  static readonly method = "preview/renameSave";
  static readonly type = new MessageProtocolRequestType<
    RenameSaveMethod,
    RenameSaveParams,
    RenameSaveResult
  >(RenameSaveMessage.method);
}

export namespace RenameSaveMessage {
  export interface Request extends RequestMessage<
    RenameSaveMethod,
    RenameSaveParams,
    RenameSaveResult
  > {}
  export type Response = ResponseMessage<RenameSaveMethod, RenameSaveResult>;
}
