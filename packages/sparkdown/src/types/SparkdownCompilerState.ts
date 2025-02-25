import { SparkdownRuntimeFormat } from "./SparkdownRuntimeFormat";
import { SparkTranspilationOffset } from "./SparkTranspilationOffset";

export interface SparkdownCompilerState {
  compiled?: SparkdownRuntimeFormat;
  sourceMap?: {
    [uri: string]: { [line: number]: SparkTranspilationOffset };
  };
  implicitDefs?: {
    [type: string]: { [name: string]: any };
  };
}
