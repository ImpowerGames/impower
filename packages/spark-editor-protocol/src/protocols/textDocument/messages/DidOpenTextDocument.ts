import { DidOpenTextDocumentParams, NotificationMessage } from "../../../types";

export type DidOpenTextDocumentMethod = typeof DidOpenTextDocument.method;

export interface DidOpenTextDocumentNotificationMessage
  extends NotificationMessage<
    DidOpenTextDocumentMethod,
    DidOpenTextDocumentParams
  > {}

export class DidOpenTextDocument {
  static readonly method = "textDocument/didOpen";
  static isNotification(
    obj: any
  ): obj is DidOpenTextDocumentNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: DidOpenTextDocumentParams
  ): DidOpenTextDocumentNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
