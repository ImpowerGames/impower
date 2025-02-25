import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkReference } from "./SparkReference";
import { SparkLocation } from "./SparkLocation";

export interface SparkProgram {
  uri: string;
  scripts?: string[];
  compiled?: ArrayBuffer;
  metadata?: {
    colors?: Record<string, SparkLocation[]>;
    properties?: Record<string, SparkLocation[]>;
    scopes?: {
      [path: string]: {
        [declarationType: string]: SparkLocation[];
      };
    };
  };
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
