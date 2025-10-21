import type * as LSP from "../../types";
import { NotificationMessage } from "../../types/base/NotificationMessage";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidChangeTextDocumentMethod =
  typeof DidChangeTextDocumentMessage.method;

export type DidChangeTextDocumentParams = LSP.DidChangeTextDocumentParams;

export class DidChangeTextDocumentMessage {
  static readonly method = "textDocument/didChange";
  static readonly type = new MessageProtocolNotificationType<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  >(DidChangeTextDocumentMessage.method);
}

export namespace DidChangeTextDocumentMessage {
  export interface Notification
    extends NotificationMessage<
      DidChangeTextDocumentMethod,
      DidChangeTextDocumentParams
    > {}
}
