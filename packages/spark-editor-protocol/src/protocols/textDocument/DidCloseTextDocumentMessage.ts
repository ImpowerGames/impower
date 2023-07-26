import {
  DidCloseTextDocumentParams,
  MessageDirection,
} from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCloseTextDocumentMethod =
  typeof DidCloseTextDocumentMessage.method;

export abstract class DidCloseTextDocumentMessage {
  static readonly method = "textDocument/didClose";
  static readonly messageDirection = MessageDirection.clientToServer;
  static readonly type = new MessageProtocolNotificationType<
    DidCloseTextDocumentMethod,
    DidCloseTextDocumentParams
  >(DidCloseTextDocumentMessage.method);
}
