import { SparkleNode } from "@impower/sparkle-screen-renderer/src/parser/parser";
import { type File } from "./File";
import { Range, type SparkDiagnostic } from "./SparkDiagnostic";

export type ScriptLocation = [
  scriptIndex: number,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
];

export interface SparkProgram {
  uri: string;
  scripts: Record<string, number>;
  files: Record<string, Omit<File, "src" | "text" | "data">>;
  compiled?: Record<string, any>;
  workspace?: string;
  startFrom?: { file: string; line: number };
  simulationOptions?: Record<
    string,
    {
      favoredConditions?: (boolean | undefined)[];
      favoredChoices?: (number | undefined)[];
    }
  >;
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
  colorAnnotations?: {
    [uri: string]: Range[];
  };
  pathLocations?: {
    [path: string]: ScriptLocation;
  };
  functionLocations?: {
    [name: string]: ScriptLocation;
  };
  sceneLocations?: {
    [name: string]: ScriptLocation;
  };
  branchLocations?: {
    [name: string]: ScriptLocation;
  };
  knotLocations?: {
    [name: string]: ScriptLocation;
  };
  stitchLocations?: {
    [name: string]: ScriptLocation;
  };
  labelLocations?: {
    [name: string]: ScriptLocation;
  };
  dataLocations?: {
    [name: string]: ScriptLocation;
  };
  version?: number;
}
