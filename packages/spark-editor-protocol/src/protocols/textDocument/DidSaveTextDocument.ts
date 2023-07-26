import {
  DidSaveTextDocumentParams,
  MessageDirection,
} from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidSaveTextDocumentMethod = typeof DidSaveTextDocument.method;

export abstract class DidSaveTextDocument {
  static readonly method = "textDocument/didSave";
  static readonly messageDirection = MessageDirection.clientToServer;
  static readonly type = new MessageProtocolNotificationType<
    DidSaveTextDocumentMethod,
    DidSaveTextDocumentParams
  >(DidSaveTextDocument.method);
}
