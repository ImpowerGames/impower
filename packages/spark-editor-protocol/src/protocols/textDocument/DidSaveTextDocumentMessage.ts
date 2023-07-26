import {
  DidSaveTextDocumentParams,
  MessageDirection,
} from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidSaveTextDocumentMethod =
  typeof DidSaveTextDocumentMessage.method;

export abstract class DidSaveTextDocumentMessage {
  static readonly method = "textDocument/didSave";
  static readonly messageDirection = MessageDirection.clientToServer;
  static readonly type = new MessageProtocolNotificationType<
    DidSaveTextDocumentMethod,
    DidSaveTextDocumentParams
  >(DidSaveTextDocumentMessage.method);
}
