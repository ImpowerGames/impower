import type { RequestMessage } from "../../types/base/RequestMessage";
import type { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";
import type { PreviewSave } from "./ListSavesMessage";

export type WriteSaveMethod = typeof WriteSaveMessage.method;

export interface WriteSaveParams {
  save: PreviewSave;
}

export interface WriteSaveResult {}

export class WriteSaveMessage {
  static readonly method = "preview/writeSave";
  static readonly type = new MessageProtocolRequestType<
    WriteSaveMethod,
    WriteSaveParams,
    WriteSaveResult
  >(WriteSaveMessage.method);
}

export namespace WriteSaveMessage {
  export interface Request extends RequestMessage<
    WriteSaveMethod,
    WriteSaveParams,
    WriteSaveResult
  > {}
  export type Response = ResponseMessage<WriteSaveMethod, WriteSaveResult>;
}
