import { DidCloseTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCloseTextDocumentMethod =
  typeof DidCloseTextDocumentMessage.method;

export class DidCloseTextDocumentMessage {
  static readonly method = "textDocument/didClose";
  static readonly type = new MessageProtocolNotificationType<
    DidCloseTextDocumentMethod,
    DidCloseTextDocumentParams
  >(DidCloseTextDocumentMessage.method);
}
