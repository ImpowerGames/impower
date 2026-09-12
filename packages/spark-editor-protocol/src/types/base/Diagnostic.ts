import type {
  Diagnostic as LSPDiagnostic,
  MarkupContent,
} from "vscode-languageserver-protocol";
export type {
  Location,
  DiagnosticRelatedInformation,
  DiagnosticSeverity,
  DiagnosticTag,
  CodeDescription,
} from "vscode-languageserver-protocol";

/** Spark diagnostics also support rendered markup in their message. */
export interface Diagnostic extends Omit<LSPDiagnostic, "message"> {
  message: string | MarkupContent;
}
