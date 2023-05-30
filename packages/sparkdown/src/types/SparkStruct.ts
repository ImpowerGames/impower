import { SparkField } from "./SparkField";

export interface SparkStruct {
  from: number;
  to: number;
  line: number;
  name: string;
  base: string;
  type: string;
  fields: Record<string, SparkField>;
}
