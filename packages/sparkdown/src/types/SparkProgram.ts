import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkdownRuntimeFormat } from "./SparkdownRuntimeFormat";

export interface SparkProgram {
  uri: string;
  scripts: string[];
  compiled?: ArrayBuffer | SparkdownRuntimeFormat;
  context?: {
    [type: string]: { [name: string]: any };
  };
  diagnostics?: {
    [uri: string]: SparkDiagnostic[];
  };
}
