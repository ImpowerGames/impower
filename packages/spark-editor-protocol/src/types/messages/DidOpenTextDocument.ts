import { Message } from "../Message";
import { TextDocumentItem } from "../TextDocumentItem";

export type DidOpenTextDocumentMethod = typeof DidOpenTextDocument.method;

export interface DidOpenTextDocumentParams {
  textDocument: TextDocumentItem;
}

export interface DidOpenTextDocumentMessage
  extends Message<DidOpenTextDocumentMethod, DidOpenTextDocumentParams> {}

export class DidOpenTextDocument {
  static readonly method = "textDocument/didOpen";
  static is(obj: any): obj is DidOpenTextDocumentMessage {
    return obj.method === this.method;
  }
  static message(
    params: DidOpenTextDocumentParams
  ): DidOpenTextDocumentMessage {
    return {
      method: this.method,
      params,
    };
  }
}
