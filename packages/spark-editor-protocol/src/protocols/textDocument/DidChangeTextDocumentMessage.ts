import { DidChangeTextDocumentParams } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeTextDocumentMethod =
  typeof DidChangeTextDocumentMessage.method;

export namespace DidChangeTextDocumentMessage {
  export const method = "textDocument/didChange";
  export const type = new MessageProtocolNotificationType<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  >(DidChangeTextDocumentMessage.method);
}
