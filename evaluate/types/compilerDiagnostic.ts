import { CompilerDiagnosticType } from "./compilerDiagnosticType";

export interface CompilerDiagnostic {
  content: string;
  from: number;
  to: number;
  severity: "info" | "warning" | "error";
  type: CompilerDiagnosticType;
  message: string;
}
