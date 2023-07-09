import { Message } from "../Message";
import { TextDocumentContentChangeEvent } from "../TextDocumentContentChangeEvent";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type DidChangeTextDocumentMethod = typeof DidChangeTextDocument.method;

export interface DidChangeTextDocumentParams {
  textDocument: TextDocumentIdentifier;
  contentChanges: TextDocumentContentChangeEvent[];
}

export interface DidChangeTextDocumentMessage
  extends Message<DidChangeTextDocumentMethod, DidChangeTextDocumentParams> {}

export class DidChangeTextDocument {
  static readonly method = "textDocument/didChange";
  static is(obj: any): obj is DidChangeTextDocumentMessage {
    return obj.method === this.method;
  }
  static create(
    params: DidChangeTextDocumentParams
  ): DidChangeTextDocumentMessage {
    return {
      method: this.method,
      params,
    };
  }
}
