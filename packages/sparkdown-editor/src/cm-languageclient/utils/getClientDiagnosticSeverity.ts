import { DiagnosticSeverity } from "vscode-languageserver-protocol";

export const getClientDiagnosticSeverity = (
  s: DiagnosticSeverity | undefined
): "error" | "warning" | "info" => {
  if (s === DiagnosticSeverity.Error) {
    return "error";
  }
  if (s === DiagnosticSeverity.Warning) {
    return "warning";
  }
  return "info";
};
