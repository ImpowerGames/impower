import { type DidChangeTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeTextDocumentMethod =
  typeof DidChangeTextDocumentMessage.method;

export class DidChangeTextDocumentMessage {
  static readonly method = "textDocument/didChange";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  >(DidChangeTextDocumentMessage.method);
}
