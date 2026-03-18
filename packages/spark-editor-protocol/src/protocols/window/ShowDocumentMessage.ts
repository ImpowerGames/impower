import type * as LSP from "../../types";
import { RequestMessage } from "../../types/base/RequestMessage";
import { ResponseMessage } from "../../types/base/ResponseMessage";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ShowDocumentMethod = typeof ShowDocumentMessage.method;

export type ShowDocumentParams = LSP.ShowDocumentParams;

export type ShowDocumentResult = LSP.ShowDocumentResult;

export class ShowDocumentMessage {
  static readonly method = "window/showDocument";
  static readonly type = new MessageProtocolRequestType<
    ShowDocumentMethod,
    ShowDocumentParams,
    ShowDocumentResult
  >(ShowDocumentMessage.method);
}

export namespace ShowDocumentMessage {
  export interface Request extends RequestMessage<
    ShowDocumentMethod,
    ShowDocumentParams,
    ShowDocumentResult
  > {}
  export interface Response extends ResponseMessage<
    ShowDocumentMethod,
    ShowDocumentResult
  > {}
}
