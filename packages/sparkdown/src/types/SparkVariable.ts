import { SparkPrimitiveType } from "./SparkPrimitiveType";
import { SparkRange } from "./SparkRange";

export interface SparkVariable extends SparkRange {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkPrimitiveType | string;
  value: unknown;
}
