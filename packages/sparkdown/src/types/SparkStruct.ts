import { SparkField } from "./SparkField";
import { SparkRange } from "./SparkRange";

export interface SparkStruct extends SparkRange {
  from: number;
  to: number;
  line: number;
  name: string;
  base: string;
  type: string;
  fields: Record<string, SparkField>;
}
