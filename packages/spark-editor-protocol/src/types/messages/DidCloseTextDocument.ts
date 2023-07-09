import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type DidCloseTextDocumentMethod = typeof DidCloseTextDocument.method;

export interface DidCloseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
}

export interface DidCloseTextDocumentMessage
  extends Message<DidCloseTextDocumentMethod, DidCloseTextDocumentParams> {}

export class DidCloseTextDocument {
  static readonly method = "textDocument/didClose";
  static is(obj: any): obj is DidCloseTextDocumentMessage {
    return obj.method === this.method;
  }
  static message(
    params: DidCloseTextDocumentParams
  ): DidCloseTextDocumentMessage {
    return {
      method: this.method,
      params,
    };
  }
}
