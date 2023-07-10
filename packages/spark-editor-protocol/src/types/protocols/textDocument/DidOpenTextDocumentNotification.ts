import { NotificationMessage } from "../../base/NotificationMessage";
import { TextDocumentItem } from "../TextDocumentItem";

export type DidOpenTextDocumentMethod =
  typeof DidOpenTextDocumentNotification.method;

export interface DidOpenTextDocumentParams {
  textDocument: TextDocumentItem;
}

export interface DidOpenTextDocumentMessage
  extends NotificationMessage<
    DidOpenTextDocumentMethod,
    DidOpenTextDocumentParams
  > {}

export class DidOpenTextDocumentNotification {
  static readonly method = "textDocument/didOpen";
  static is(obj: any): obj is DidOpenTextDocumentMessage {
    return obj.method === this.method;
  }
  static message(
    params: DidOpenTextDocumentParams
  ): DidOpenTextDocumentMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
