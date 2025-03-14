import type * as LSP from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidSaveTextDocumentMethod =
  typeof DidSaveTextDocumentMessage.method;

export type DidSaveTextDocumentParams = LSP.DidSaveTextDocumentParams;

export class DidSaveTextDocumentMessage {
  static readonly method = "textDocument/didSave";
  static readonly type = new MessageProtocolNotificationType<
    DidSaveTextDocumentMethod,
    DidSaveTextDocumentParams
  >(DidSaveTextDocumentMessage.method);
}
