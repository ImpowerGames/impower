import {
  DidCloseTextDocumentParams,
  NotificationMessage,
} from "../../../types";

export type DidCloseTextDocumentMethod = typeof DidCloseTextDocument.method;

export interface DidCloseTextDocumentNotificationMessage
  extends NotificationMessage<
    DidCloseTextDocumentMethod,
    DidCloseTextDocumentParams
  > {}

export class DidCloseTextDocument {
  static readonly method = "textDocument/didClose";
  static isNotification(
    obj: any
  ): obj is DidCloseTextDocumentNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: DidCloseTextDocumentParams
  ): DidCloseTextDocumentNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
