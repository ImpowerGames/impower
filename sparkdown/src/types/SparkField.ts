import { SparkFieldType } from "./SparkFieldType";

export interface SparkField {
  from: number;
  to: number;
  line: number;
  name: string;
  type: SparkFieldType;
  valueText: string;
  value: unknown;
  imported?: boolean;
  struct?: string;
}
