import { SparkdownRuntimeFormat } from "./SparkdownRuntimeFormat";
import { SparkLocation } from "./SparkLocation";
import { SparkTranspilationOffset } from "./SparkTranspilationOffset";

export interface SparkdownCompilerState {
  compiled?: SparkdownRuntimeFormat;
  sourceMap?: {
    [uri: string]: { [line: number]: SparkTranspilationOffset };
  };
  implicitDefs?: {
    [type: string]: { [name: string]: any };
  };
  properties?: Record<string, SparkLocation[]>;
}
