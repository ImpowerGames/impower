import type { MorphProgramChannel } from "../../morph/types";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { type File } from "./File";
import type { ProgramChangeSummary } from "./ProgramChangeSummary";
import { type SceneAssets } from "./SceneAssets";
import type { Range,SparkDiagnostic } from "./SparkDiagnostic";
import {
  type ComponentNode,
  type LayoutNode,
  type ScreenNode,
} from "./SparkleNode";

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
  chunks?: ProgramRoot;
  workspace?: string;
  startFrom?: { file: string; line: number };
  changes?: ProgramChangeSummary;
  context?: {
    [type: string]: { [name: string]: any };
  };
  contextRevision?: string;
  layouts?: { [name: string]: any };
  screens?: { [name: string]: any };
  components?: { [name: string]: any };
  styles?: { [name: string]: any };
  sparkle?: {
    layouts?: { [name: string]: LayoutNode };
    screens?: { [name: string]: ScreenNode };
    components?: { [name: string]: ComponentNode };
  };
  assets?: { [type: string]: { [name: string]: any } };
  morphs?: MorphProgramChannel;
  diagnostics?: {
    [uri: string]: SparkDiagnostic[];
  };
  colorAnnotations?: {
    [uri: string]: Range[];
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
  flowEnds?: {
    [uri: string]: [headerLine: number, endLine: number][];
  };
  labelLocations?: {
    [name: string]: ScriptLocation;
  };
  storeTypes?: {
    [name: string]: string;
  };
  sceneAssets?: { [flowName: string]: SceneAssets };
  version?: number;
  filesEpoch?: number;
  summary?: true;
  runnable?: boolean;
}
