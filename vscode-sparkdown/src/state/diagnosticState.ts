import * as vscode from "vscode";

export const diagnosticState = {
  diagnosticCollection:
    vscode.languages.createDiagnosticCollection("sparkdown"),
  diagnostics: [] as vscode.Diagnostic[],
};
