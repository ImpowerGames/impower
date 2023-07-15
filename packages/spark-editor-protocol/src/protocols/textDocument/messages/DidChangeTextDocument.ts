import {
  DidChangeTextDocumentParams,
  NotificationMessage,
} from "../../../types";

export type DidChangeTextDocumentMethod = typeof DidChangeTextDocument.method;

export interface DidChangeTextDocumentNotificationMessage
  extends NotificationMessage<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  > {}

export class DidChangeTextDocument {
  static readonly method = "textDocument/didChange";
  static isNotification(
    obj: any
  ): obj is DidChangeTextDocumentNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: DidChangeTextDocumentParams
  ): DidChangeTextDocumentNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
