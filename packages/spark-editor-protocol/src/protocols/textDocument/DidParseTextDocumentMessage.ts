import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { VersionedTextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidParseTextDocumentMethod =
  typeof DidParseTextDocumentMessage.method;

export interface DidParseTextDocumentParams {
  /**
   * The document that was parsed.
   */
  textDocument: VersionedTextDocumentIdentifier;
  /**
   * The parsed program.
   */
  program: SparkProgram;
}

export class DidParseTextDocumentMessage {
  static readonly method = "textDocument/didParse";
  static readonly type = new MessageProtocolNotificationType<
    DidParseTextDocumentMethod,
    DidParseTextDocumentParams
  >(DidParseTextDocumentMessage.method);
}
