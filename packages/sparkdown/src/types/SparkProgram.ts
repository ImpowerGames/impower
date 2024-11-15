import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkReference } from "./SparkReference";
import { SparkLocation } from "./SparkLocation";
import { SparkTranspilationOffset } from "./SparkTranspilationOffset";

export interface SparkProgram {
  compiled?: {
    root: any;
    listDefs?: any;
    structDefs?: { [type: string]: { [name: string]: any } };
  };
  metadata?: {
    characters?: Record<string, SparkLocation[]>;
    scenes?: Record<string, SparkLocation[]>;
    transitions?: Record<string, SparkLocation[]>;
    colors?: Record<string, SparkLocation[]>;
  };
  context?: {
    [type: string]: { [name: string]: any };
  };
  implicitDefs?: {
    [type: string]: { [name: string]: any };
  };
  declarations?: {
    [uri: string]: { [line: number]: SparkReference[] };
  };
  references?: {
    [uri: string]: { [line: number]: SparkReference[] };
  };
  sourceMap?: {
    [uri: string]: { [line: number]: SparkTranspilationOffset };
  };
  diagnostics?: {
    [uri: string]: SparkDiagnostic[];
  };
  uuidToSource?: Record<string, [file: number, line: number]>;
  uuidToPath?: Record<string, string>;
}
