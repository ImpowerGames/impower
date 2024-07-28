import { SparkDiagnostic } from "./SparkDiagnostic";

export interface SparkProgram {
  compiled?: {
    root: any;
    listDefs?: any;
    structDefs?: { [type: string]: { [name: string]: any } };
  };
  diagnostics?: SparkDiagnostic[];
  sourceMap?: Record<string, string[]>;
}
