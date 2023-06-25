import {
  DocumentUri,
  MessageDirection,
  ProtocolNotificationType,
} from "vscode-languageserver";
import { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";

export interface DidParseParams {
  /**
   * The URI for which diagnostic information is reported.
   */
  uri: DocumentUri;
  /**
   * Optional the version number of the document the diagnostics are published for.
   *
   * @since 3.15.0
   */
  version?: number;
  /**
   * The parsed program for the text document.
   */
  program: SparkProgram;
}

export class DidParseTextDocument {
  static readonly method = "textDocument/didParse";
  static readonly messageDirection = MessageDirection.serverToClient;
  static readonly type: ProtocolNotificationType<DidParseParams, void> =
    new ProtocolNotificationType<DidParseParams, void>(
      DidParseTextDocument.method
    );
}
