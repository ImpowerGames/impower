import { NotificationMessage } from "../../base/NotificationMessage";
import { TextDocumentContentChangeEvent } from "../TextDocumentContentChangeEvent";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type DidChangeTextDocumentMethod =
  typeof DidChangeTextDocumentNotification.method;

export interface DidChangeTextDocumentParams {
  textDocument: TextDocumentIdentifier;
  contentChanges: TextDocumentContentChangeEvent[];
}

export interface DidChangeTextDocumentMessage
  extends NotificationMessage<
    DidChangeTextDocumentMethod,
    DidChangeTextDocumentParams
  > {}

export class DidChangeTextDocumentNotification {
  static readonly method = "textDocument/didChange";
  static is(obj: any): obj is DidChangeTextDocumentMessage {
    return obj.method === this.method;
  }
  static message(
    params: DidChangeTextDocumentParams
  ): DidChangeTextDocumentMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
