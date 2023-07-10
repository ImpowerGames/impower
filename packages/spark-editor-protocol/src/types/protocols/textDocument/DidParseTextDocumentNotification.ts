import type { SparkProgram } from "../../../../../sparkdown/src/types/SparkProgram";
import { NotificationMessage } from "../../base/NotificationMessage";
import { TextDocumentIdentifier } from "../TextDocumentIdentifier";

export type DidParseTextDocumentMethod =
  typeof DidParseTextDocumentNotification.method;

export interface DidParseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
  program: SparkProgram;
}

export interface DidParseTextDocumentMessage
  extends NotificationMessage<
    DidParseTextDocumentMethod,
    DidParseTextDocumentParams
  > {}

export class DidParseTextDocumentNotification {
  static readonly method = "textDocument/didParse";
  static is(obj: any): obj is DidParseTextDocumentMessage {
    return obj.method === this.method;
  }
  static message(
    params: DidParseTextDocumentParams
  ): DidParseTextDocumentMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
