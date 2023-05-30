import { SparkStruct } from "./SparkStruct";
import { SparkVariable } from "./SparkVariable";

export interface SparkDeclarations {
  variables?: Record<string, SparkVariable>;
  structs?: Record<string, SparkStruct>;
  objectMap?: {
    [type: string]: Record<string, any>;
  };
}
