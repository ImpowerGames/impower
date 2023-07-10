import { NotificationMessage } from "../../base/NotificationMessage";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type DidCloseTextDocumentMethod =
  typeof DidCloseTextDocumentNotification.method;

export interface DidCloseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
}

export interface DidCloseTextDocumentMessage
  extends NotificationMessage<
    DidCloseTextDocumentMethod,
    DidCloseTextDocumentParams
  > {}

export class DidCloseTextDocumentNotification {
  static readonly method = "textDocument/didClose";
  static is(obj: any): obj is DidCloseTextDocumentMessage {
    return obj.method === this.method;
  }
  static message(
    params: DidCloseTextDocumentParams
  ): DidCloseTextDocumentMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
