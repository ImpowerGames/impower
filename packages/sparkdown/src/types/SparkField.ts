import { SparkFieldType } from "./SparkFieldType";
import { SparkRange } from "./SparkRange";

export interface SparkField extends SparkRange {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkFieldType;
  valueText: string;
  value: unknown;
  struct?: string;
}
