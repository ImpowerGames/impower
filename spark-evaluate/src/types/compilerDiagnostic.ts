export interface CompilerDiagnostic {
  content: string;
  from: number;
  to: number;
  severity: "info" | "warning" | "error";
  message: string;
}
