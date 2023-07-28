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

export namespace ParseTextDocumentMessage {
  export const method = "textDocument/parse";
  export const type = new MessageProtocolRequestType<
    ParseTextDocumentMethod,
    ParseTextDocumentParams,
    SparkProgram
  >(ParseTextDocumentMessage.method);
}
