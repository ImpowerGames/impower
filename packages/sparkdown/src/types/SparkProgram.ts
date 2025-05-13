import { SparkleNode } from "@impower/sparkle-screen-renderer/src/parser/parser";
import { type File } from "./File";
import { type SparkDiagnostic } from "./SparkDiagnostic";

export type Location = [
  scriptIndex: number,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
];

export interface SparkProgram {
  uri: string;
  scripts: Record<string, number>;
  files: Record<string, Omit<File, "src" | "text" | "data">>;
  compiled?: string;
  ui?: {
    screen?: Record<string, SparkleNode>;
    component?: Record<string, SparkleNode>;
    style?: Record<string, SparkleNode>;
    animation?: Record<string, SparkleNode>;
    theme?: Record<string, SparkleNode>;
  };
  context?: {
    [type: string]: { [name: string]: any };
  };
  diagnostics?: {
    [uri: string]: SparkDiagnostic[];
  };
  pathToLocation?: {
    [path: string]: Location;
  };
  functionLocations?: {
    [name: string]: Location;
  };
  knotLocations?: {
    [name: string]: Location;
  };
  stitchLocations?: {
    [name: string]: Location;
  };
  labelLocations?: {
    [name: string]: Location;
  };
  dataLocations?: {
    [name: string]: Location;
  };
  version?: number;
}
