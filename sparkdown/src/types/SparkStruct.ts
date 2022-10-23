import { SparkField } from "./SparkField";
import { SparkStructType } from "./SparkStructType";

export interface SparkStruct {
  from: number;
  to: number;
  line: number;
  name: string;
  base: string;
  type: SparkStructType;
  fields: Record<string, SparkField>;
  imported?: boolean;
}
