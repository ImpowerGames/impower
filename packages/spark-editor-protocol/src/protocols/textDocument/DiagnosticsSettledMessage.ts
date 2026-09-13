import type { Diagnostic, TextDocumentIdentifier } from "../../types";
import { MessageProtocolRequestType } from "../MessageProtocolRequestType";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export interface DiagnosticsSettledParams {
  textDocument: TextDocumentIdentifier;
  /** Reject a response for an older document revision. */
  version?: number;
}
export interface DiagnosticsSettledResult {
  uri: string;
  version: number | null;
  diagnostics: Diagnostic[];
}
export class DiagnosticsSettledMessage {
  static readonly method = "textDocument/diagnosticsSettled";
  static readonly type = new MessageProtocolRequestType<
    typeof DiagnosticsSettledMessage.method, DiagnosticsSettledParams, DiagnosticsSettledResult
  >(DiagnosticsSettledMessage.method);
}
export class DidSettleDiagnosticsMessage {
  static readonly method = "textDocument/didSettleDiagnostics";
  static readonly type = new MessageProtocolNotificationType<
    typeof DidSettleDiagnosticsMessage.method, DiagnosticsSettledResult
  >(DidSettleDiagnosticsMessage.method);
}
