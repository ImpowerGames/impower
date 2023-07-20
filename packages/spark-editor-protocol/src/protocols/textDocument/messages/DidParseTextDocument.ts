import type { SparkProgram } from "../../../../../sparkdown/src/types/SparkProgram";
import { VersionedTextDocumentIdentifier } from "../../../types";
import { MessageDirection } from "../../../types/lsp/messages";
import { MessageProtocolNotificationType } from "../../MessageProtocolNotificationType";

export type DidParseTextDocumentMethod = typeof DidParseTextDocument.method;

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

export abstract class DidParseTextDocument {
  static readonly method = "textDocument/didParse";
  static readonly messageDirection = MessageDirection.serverToClient;
  static readonly type = new MessageProtocolNotificationType<
    DidParseTextDocumentMethod,
    DidParseTextDocumentParams
  >(DidParseTextDocument.method);
}
