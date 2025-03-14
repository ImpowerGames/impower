import type * as LSP from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCloseTextDocumentMethod =
  typeof DidCloseTextDocumentMessage.method;

export type DidCloseTextDocumentParams = LSP.DidCloseTextDocumentParams;

export class DidCloseTextDocumentMessage {
  static readonly method = "textDocument/didClose";
  static readonly type = new MessageProtocolNotificationType<
    DidCloseTextDocumentMethod,
    DidCloseTextDocumentParams
  >(DidCloseTextDocumentMessage.method);
}
