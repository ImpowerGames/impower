import { SparkField } from "./SparkField";
import { SparkRange } from "./SparkRange";

export interface SparkVariable extends SparkRange {
  tag: string;
  line: number;
  from: number;
  to: number;
  indent: number;
  stored: boolean;
  type: string;
  name: string;
  value: string;
  compiled: any;
  fields?: SparkField[];

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    value?: SparkRange;
  };
}
