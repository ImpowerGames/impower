import {
  DidOpenTextDocumentParams,
  MessageDirection,
} from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenTextDocumentMethod = typeof DidOpenTextDocument.method;

export abstract class DidOpenTextDocument {
  static readonly method = "textDocument/didOpen";
  static readonly messageDirection = MessageDirection.clientToServer;
  static readonly type = new MessageProtocolNotificationType<
    DidOpenTextDocumentMethod,
    DidOpenTextDocumentParams
  >(DidOpenTextDocument.method);
}
