import type { SparkProgram } from "../../../../../sparkdown/src/types/SparkProgram";
import { NotificationMessage, TextDocumentIdentifier } from "../../../types";
import { NotificationProtocolType } from "../../NotificationProtocolType";

export type DidParseTextDocumentMethod =
  typeof DidParseTextDocument.type.method;

export interface DidParseTextDocumentParams {
  textDocument: TextDocumentIdentifier;
  program: SparkProgram;
}

export interface DidParseTextDocumentNotificationMessage
  extends NotificationMessage<
    DidParseTextDocumentMethod,
    DidParseTextDocumentParams
  > {}

class DidParseTextDocumentProtocolType extends NotificationProtocolType<
  DidParseTextDocumentNotificationMessage,
  DidParseTextDocumentParams
> {
  method = "textDocument/didParse";
}

export abstract class DidParseTextDocument {
  static readonly type = new DidParseTextDocumentProtocolType();
}
