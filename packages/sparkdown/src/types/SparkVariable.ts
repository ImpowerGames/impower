import { SparkRange } from "./SparkRange";
import { SparkVariableType } from "./SparkVariableType";

export interface SparkVariable extends SparkRange {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkVariableType;
  value: unknown;
}
