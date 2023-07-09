import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { Message } from "../Message";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type DidParseTextDocumentMethod = typeof DidParseTextDocument.method;

export interface DidParseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
  program: SparkProgram;
}

export interface DidParseTextDocumentMessage
  extends Message<DidParseTextDocumentMethod, DidParseTextDocumentParams> {}

export class DidParseTextDocument {
  static readonly method = "textDocument/didParse";
  static is(obj: any): obj is DidParseTextDocumentMessage {
    return obj.method === this.method;
  }
  static message(
    params: DidParseTextDocumentParams
  ): DidParseTextDocumentMessage {
    return {
      method: this.method,
      params,
    };
  }
}
