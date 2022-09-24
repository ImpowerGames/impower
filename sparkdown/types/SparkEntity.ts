import { SparkEntityType } from "./SparkEntityType";
import { SparkField } from "./SparkField";

export interface SparkEntity {
  from: number;
  to: number;
  line: number;
  name: string;
  base: string;
  type: SparkEntityType;
  fields: Record<string, SparkField>;
}
