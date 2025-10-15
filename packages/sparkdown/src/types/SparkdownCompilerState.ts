import { Story } from "../inkjs/engine/Story";
import { SparkTranspilationOffset } from "./SparkTranspilationOffset";

export interface SparkdownCompilerState {
  sourceMap?: {
    [uri: string]: { [line: number]: SparkTranspilationOffset };
  };
  story?: Story;
}
