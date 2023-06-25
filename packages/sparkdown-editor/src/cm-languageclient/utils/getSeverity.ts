import { DiagnosticSeverity } from "vscode-languageserver-protocol";

export const getSeverity = (
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
