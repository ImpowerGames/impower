import { SparkRange } from "./SparkRange";

export interface SparkVariable extends SparkRange {
  from: number;
  to: number;
  line: number;
  type: string;
  name: string;
  value: string;
  compiled: unknown;
}
