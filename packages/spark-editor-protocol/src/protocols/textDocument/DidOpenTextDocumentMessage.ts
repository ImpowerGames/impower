import type * as LSP from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidOpenTextDocumentMethod =
  typeof DidOpenTextDocumentMessage.method;

export type DidOpenTextDocumentParams = LSP.DidOpenTextDocumentParams;

export class DidOpenTextDocumentMessage {
  static readonly method = "textDocument/didOpen";
  static readonly type = new MessageProtocolNotificationType<
    DidOpenTextDocumentMethod,
    DidOpenTextDocumentParams
  >(DidOpenTextDocumentMessage.method);
}
