import { File } from "./File";
import { SparkDiagnostic } from "./SparkDiagnostic";
import { SparkdownRuntimeFormat } from "./SparkdownRuntimeFormat";

export interface SparkProgram {
  uri: string;
  scripts: Record<string, number>;
  files: Record<string, Omit<File, "src" | "text" | "data">>;
  compiled?: SparkdownRuntimeFormat;
  context?: {
    [type: string]: { [name: string]: any };
  };
  diagnostics?: {
    [uri: string]: SparkDiagnostic[];
  };
  pathToLocation?: {
    [path: string]: [
      scriptIndex: number,
      startLine: number,
      startColumn: number,
      endLine: number,
      endColumn: number
    ];
  };
  functionLocations?: {
    [name: string]: [
      scriptIndex: number,
      startLine: number,
      startColumn: number,
      endLine: number,
      endColumn: number
    ];
  };
  knotLocations?: {
    [name: string]: [
      scriptIndex: number,
      startLine: number,
      startColumn: number,
      endLine: number,
      endColumn: number
    ];
  };
  stitchLocations?: {
    [name: string]: [
      scriptIndex: number,
      startLine: number,
      startColumn: number,
      endLine: number,
      endColumn: number
    ];
  };
  labelLocations?: {
    [name: string]: [
      scriptIndex: number,
      startLine: number,
      startColumn: number,
      endLine: number,
      endColumn: number
    ];
  };
  dataLocations?: {
    [name: string]: [
      scriptIndex: number,
      startLine: number,
      startColumn: number,
      endLine: number,
      endColumn: number
    ];
  };
  version?: number;
}
