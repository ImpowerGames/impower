import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type ParseTextDocumentMethod = typeof ParseTextDocumentMessage.method;

export interface ParseTextDocumentParams {
  /**
   * The document that should be parsed.
   */
  textDocument: TextDocumentIdentifier;
}

export class ParseTextDocumentMessage {
  static readonly method = "textDocument/parse";
  static readonly type = new MessageProtocolRequestType<
    ParseTextDocumentMethod,
    ParseTextDocumentParams,
    SparkProgram
  >(ParseTextDocumentMessage.method);
}
