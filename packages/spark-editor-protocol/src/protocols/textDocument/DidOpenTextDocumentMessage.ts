import { DidOpenTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenTextDocumentMethod =
  typeof DidOpenTextDocumentMessage.method;

export class DidOpenTextDocumentMessage {
  static readonly method = "textDocument/didOpen";
  static readonly type = new MessageProtocolNotificationType<
    DidOpenTextDocumentMethod,
    DidOpenTextDocumentParams
  >(DidOpenTextDocumentMessage.method);
}
