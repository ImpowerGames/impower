import { DidSaveTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidSaveTextDocumentMethod =
  typeof DidSaveTextDocumentMessage.method;

export class DidSaveTextDocumentMessage {
  static readonly method = "textDocument/didSave";
  static readonly type = new MessageProtocolNotificationType<
    DidSaveTextDocumentMethod,
    DidSaveTextDocumentParams
  >(DidSaveTextDocumentMessage.method);
}
