export interface Diagnostic {
  from: number;
  to: number;
  content: string;
  severity?: "info" | "warning" | "error";
  message?: string;
}
