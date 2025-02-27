import { SparkLocation } from "./SparkLocation";
import { SparkTranspilationOffset } from "./SparkTranspilationOffset";

export interface SparkdownCompilerState {
  transpiledScripts?: {
    [uri: string]: string;
  };
  sourceMap?: {
    [uri: string]: { [line: number]: SparkTranspilationOffset };
  };
  properties?: Record<string, SparkLocation[]>;
  implicitDefs?: {
    [type: string]: { [name: string]: any };
  };
}
