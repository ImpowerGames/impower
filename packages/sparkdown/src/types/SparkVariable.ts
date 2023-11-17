import { SparkRange } from "./SparkRange";

export interface SparkVariable extends SparkRange {
  from: number;
  to: number;
  line: number;
  name: string;
  type: string;
  value: string;
  compiled: unknown;
}
