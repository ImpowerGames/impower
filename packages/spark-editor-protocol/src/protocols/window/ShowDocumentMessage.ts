import { ShowDocumentResult, ShowDocumentParams } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ShowDocumentMethod = typeof ShowDocumentMessage.method;

export class ShowDocumentMessage {
  static readonly method = "window/showDocument";
  static readonly type = new MessageProtocolRequestType<
    ShowDocumentMethod,
    ShowDocumentParams,
    ShowDocumentResult
  >(ShowDocumentMessage.method);
}
