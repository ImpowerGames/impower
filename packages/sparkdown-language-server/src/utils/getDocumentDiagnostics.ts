import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import {
  Diagnostic,
  DiagnosticSeverity,
  PublishDiagnosticsParams,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

const getDocumentDiagnostics = (
  document: TextDocument,
  program: SparkProgram
): PublishDiagnosticsParams => {
  const result: Diagnostic[] = [];
  const diagnostics = program?.diagnostics;
  if (!document || !diagnostics) {
    return { uri: document.uri, diagnostics: result };
  }
  diagnostics.forEach((d) => {
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
    result.push(diagnostic);
  });
  return { uri: document.uri, diagnostics: result };
};

export default getDocumentDiagnostics;
