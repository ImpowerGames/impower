import { SparkEntityType } from "./SparkEntityType";

export interface SparkEntity {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkEntityType;
  value: string;
}
