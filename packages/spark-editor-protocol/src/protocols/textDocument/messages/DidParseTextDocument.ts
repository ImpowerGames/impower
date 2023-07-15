import type { SparkProgram } from "../../../../../sparkdown/src/types/SparkProgram";
import { NotificationMessage, TextDocumentIdentifier } from "../../../types";

export type DidParseTextDocumentMethod = typeof DidParseTextDocument.method;

export interface DidParseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
  program: SparkProgram;
}

export interface DidParseTextDocumentNotificationMessage
  extends NotificationMessage<
    DidParseTextDocumentMethod,
    DidParseTextDocumentParams
  > {}

export class DidParseTextDocument {
  static readonly method = "textDocument/didParse";
  static isNotification(
    obj: any
  ): obj is DidParseTextDocumentNotificationMessage {
    return obj.method === this.method;
  }
  static notification(
    params: DidParseTextDocumentParams
  ): DidParseTextDocumentNotificationMessage {
    return {
      jsonrpc: "2.0",
      method: this.method,
      params,
    };
  }
}
