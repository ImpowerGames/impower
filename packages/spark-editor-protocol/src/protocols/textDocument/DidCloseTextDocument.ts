import {
  DidCloseTextDocumentParams,
  MessageDirection,
} from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCloseTextDocumentMethod = typeof DidCloseTextDocument.method;

export abstract class DidCloseTextDocument {
  static readonly method = "textDocument/didClose";
  static readonly messageDirection = MessageDirection.clientToServer;
  static readonly type = new MessageProtocolNotificationType<
    DidCloseTextDocumentMethod,
    DidCloseTextDocumentParams
  >(DidCloseTextDocument.method);
}
