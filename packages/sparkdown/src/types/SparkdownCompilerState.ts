import { SparkTranspilationOffset } from "./SparkTranspilationOffset";

export interface SparkdownCompilerState {
  transpiledScripts?: {
    [uri: string]: {
      content: string;
      version: number;
    };
  };
  sourceMap?: {
    [uri: string]: { [line: number]: SparkTranspilationOffset };
  };
}
