import { SparkRange } from "./SparkRange";

export interface SparkField extends SparkRange {
  tag: string;
  indent: number;
  path: string;
  key: string;
  type: string;
  value: string;
  id: string;
  compiled: unknown;
  ranges?: {
    key?: SparkRange;
    value?: SparkRange;
  };
}
