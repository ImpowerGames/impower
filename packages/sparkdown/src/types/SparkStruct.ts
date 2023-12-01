import { SparkField } from "./SparkField";
import { SparkRange } from "./SparkRange";

export interface SparkStruct extends SparkRange {
  tag: string;
  line: number;
  from: number;
  to: number;
  indent: number;
  id: string;
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
