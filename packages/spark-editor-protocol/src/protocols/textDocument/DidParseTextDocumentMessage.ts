import {
  MessageDirection,
  VersionedTextDocumentIdentifier,
} from "vscode-languageserver-protocol";
import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
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

export abstract class DidParseTextDocumentMessage {
  static readonly method = "textDocument/didParse";
  static readonly messageDirection = MessageDirection.serverToClient;
  static readonly type = new MessageProtocolNotificationType<
    DidParseTextDocumentMethod,
    DidParseTextDocumentParams
  >(DidParseTextDocumentMessage.method);
}
