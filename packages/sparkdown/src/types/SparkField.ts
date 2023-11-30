import { SparkRange } from "./SparkRange";

export interface SparkField extends SparkRange {
  tag: string;
  line: number;
  from: number;
  to: number;
  indent: number;
  path: string;
  key: string;
  type: string;
  value: string;
  compiled: unknown;
  ranges?: {
    key?: SparkRange;
    value?: SparkRange;
  };
}
