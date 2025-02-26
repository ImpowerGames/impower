import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkReference } from "./SparkReference";

export interface SparkProgram {
  uri: string;
  scripts?: string[];
  compiled?: ArrayBuffer;
  context?: {
    [type: string]: { [name: string]: any };
  };
  references?: {
    [uri: string]: { [line: number]: SparkReference[] };
  };
  diagnostics?: {
    [uri: string]: SparkDiagnostic[];
  };
  uuidToSource?: Record<string, [file: number, line: number]>;
  uuidToPath?: Record<string, string>;
}
