import * as vscode from "vscode";
import { SparkDiagnostic } from "../../../sparkdown/src/types/SparkDiagnostic";
import { diagnosticCollection } from "../state/diagnosticCollection";

export const updateDiagnostics = (
  uri: vscode.Uri,
  diagnostics: SparkDiagnostic[]
) => {
  diagnosticCollection.clear();
  const diags = diagnostics.map((d) => {
    const range = new vscode.Range(d.line, d.startColumn, d.line, d.endColumn);
    return new vscode.Diagnostic(
      range,
      d.message,
      d.severity === "error"
        ? vscode.DiagnosticSeverity.Error
        : d.severity === "warning"
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Information
    );
  });
  diagnosticCollection.set(uri, diags);
};
