import { SparkDiagnostic } from "./SparkDiagnostic";

export interface SparkProgram {
  compiled?: {
    root: any;
    listDefs?: any;
    structDefs?: { [type: string]: { [name: string]: any } };
  };
  diagnostics?: SparkDiagnostic[];
  sourceMap?: Record<string, Record<number, [number, number]>>;
  uuidToSource?: Record<string, [number, number]>;
  uuidToPath?: Record<string, string>;
}
