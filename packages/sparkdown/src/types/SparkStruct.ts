import { SparkField } from "./SparkField";
import { SparkRange } from "./SparkRange";

export interface SparkStruct extends SparkRange {
  line: number;
  from: number;
  to: number;
  type: string;
  name: string;
  value: string;
  fields?: SparkField[];
}
