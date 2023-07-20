import { DidChangeTextDocumentParams } from "../../../types";
import { MessageDirection } from "../../../types/lsp/messages";
import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type DidChangeTextDocumentMethod = typeof DidChangeTextDocument.method;

export abstract class DidChangeTextDocument {
  static readonly method = "textDocument/didChange";
  static readonly messageDirection = MessageDirection.clientToServer;
  static readonly type = new MessageProtocolNotificationType<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  >(DidChangeTextDocument.method);
}
