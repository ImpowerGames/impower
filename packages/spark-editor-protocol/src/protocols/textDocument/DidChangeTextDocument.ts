import {
  DidChangeTextDocumentParams,
  MessageDirection,
} from "vscode-languageserver-protocol";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeTextDocumentMethod = typeof DidChangeTextDocument.method;

export abstract class DidChangeTextDocument {
  static readonly method = "textDocument/didChange";
  static readonly messageDirection = MessageDirection.clientToServer;
  static readonly type = new MessageProtocolNotificationType<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  >(DidChangeTextDocument.method);
}
