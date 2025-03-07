import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { VersionedTextDocumentIdentifier } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidCompileTextDocumentMethod =
  typeof DidCompileTextDocumentMessage.method;

export interface DidCompileTextDocumentParams {
  /**
   * The document that was parsed.
   */
  textDocument: VersionedTextDocumentIdentifier;
  /**
   * The parsed program.
   */
  program: SparkProgram;
}

export class DidCompileTextDocumentMessage {
  static readonly method = "textDocument/didCompile";
  static readonly type = new MessageProtocolNotificationType<
    DidCompileTextDocumentMethod,
    DidCompileTextDocumentParams
  >(DidCompileTextDocumentMessage.method);
}
