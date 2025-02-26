import { SparkLocation } from "./SparkLocation";
import { SparkTranspilationOffset } from "./SparkTranspilationOffset";

export interface SparkdownCompilerState {
  implicitDefs?: {
    [type: string]: { [name: string]: any };
  };
  properties?: Record<string, SparkLocation[]>;
  transpiledScripts?: {
    [uri: string]: string;
  };
  sourceMap?: {
    [uri: string]: { [line: number]: SparkTranspilationOffset };
  };
}
