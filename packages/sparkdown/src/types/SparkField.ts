import { SparkRange } from "./SparkRange";
import { SparkVariableType } from "./SparkVariableType";

export interface SparkField extends SparkRange {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkVariableType;
  valueText: string;
  value: unknown;
  struct?: string;
}
