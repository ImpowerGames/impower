import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkReference } from "./SparkReference";
import { SparkTranspilationOffset } from "./SparkTranspilationOffset";

export interface SparkProgram {
  compiled?: {
    root: any;
    listDefs?: any;
    structDefs?: { [type: string]: { [name: string]: any } };
  };
  references?: {
    [uri: string]: { [line: number]: SparkReference[] };
  };
  sourceMap?: {
    [uri: string]: { [line: number]: SparkTranspilationOffset };
  };
  diagnostics?: SparkDiagnostic[];
  uuidToSource?: Record<string, [file: number, line: number]>;
  uuidToPath?: Record<string, string>;
}
