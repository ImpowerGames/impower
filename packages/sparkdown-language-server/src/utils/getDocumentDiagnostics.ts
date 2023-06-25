import {
  Diagnostic,
  DiagnosticSeverity,
  PublishDiagnosticsParams,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";

const getDocumentDiagnostics = (
  document: TextDocument,
  program: SparkProgram
): PublishDiagnosticsParams => {
  const diagnostics: Diagnostic[] = [];
  program.diagnostics.forEach((d) => {
    const diagnostic: Diagnostic = {
      severity:
        d.severity === "error"
          ? DiagnosticSeverity.Error
          : d.severity === "warning"
          ? DiagnosticSeverity.Warning
          : DiagnosticSeverity.Information,
      range: {
        start: document.positionAt(d.from),
        end: document.positionAt(d.to),
      },
      message: d.message,
      source: "sparkdown",
      data: d.actions,
    };
    diagnostics.push(diagnostic);
  });
  return { uri: document.uri, diagnostics };
};

export default getDocumentDiagnostics;
