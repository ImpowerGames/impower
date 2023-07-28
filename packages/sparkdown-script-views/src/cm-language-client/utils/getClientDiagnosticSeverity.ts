import { DiagnosticSeverity } from "../../../../spark-editor-protocol/src/enums/DiagnosticSeverity";

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
