import { SparkRange } from "./SparkRange";

export interface SparkField extends SparkRange {
  line: number;
  from: number;
  to: number;
  path: string;
  key: string | number;
  type: string;
  value: string;
  ranges: {
    key?: SparkRange;
    value?: SparkRange;
  };
}
