import { SparkRange } from "./SparkRange";

export interface SparkVariable extends SparkRange {
  tag: string;
  from: number;
  to: number;
  line: number;
  indent: number;
  type: string;
  name: string;
  value: string;
  compiled: unknown;

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    value?: SparkRange;
  };
}
