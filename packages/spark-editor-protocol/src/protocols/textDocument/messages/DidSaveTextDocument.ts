import { DidSaveTextDocumentParams, NotificationMessage } from "../../../types";

export type DidSaveTextDocumentMethod = typeof DidSaveTextDocument.method;

export interface DidSaveTextDocumentNotificationMessage
  extends NotificationMessage<
    DidSaveTextDocumentMethod,
    DidSaveTextDocumentParams
  > {}

export class DidSaveTextDocument {
  static readonly method = "textDocument/didSave";
  static isNotification(
    obj: any
  ): obj is DidSaveTextDocumentNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: DidSaveTextDocumentParams
  ): DidSaveTextDocumentNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
