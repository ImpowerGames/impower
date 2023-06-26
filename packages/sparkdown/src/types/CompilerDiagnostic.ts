import { SparkRange } from "./SparkRange";

export interface CompilerDiagnostic extends SparkRange {
  from: number;
  to: number;
  content: string;
  severity?: "info" | "warning" | "error";
  message?: string;
}
