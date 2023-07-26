import {
  DidOpenTextDocumentParams,
  MessageDirection,
} from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenTextDocumentMethod =
  typeof DidOpenTextDocumentMessage.method;

export abstract class DidOpenTextDocumentMessage {
  static readonly method = "textDocument/didOpen";
  static readonly messageDirection = MessageDirection.clientToServer;
  static readonly type = new MessageProtocolNotificationType<
    DidOpenTextDocumentMethod,
    DidOpenTextDocumentParams
  >(DidOpenTextDocumentMessage.method);
}
