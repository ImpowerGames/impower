import { SparkField } from "./SparkField";
import { SparkRange } from "./SparkRange";

export interface SparkStruct extends SparkRange {
  tag: "struct";
  line: number;
  from: number;
  to: number;
  indent: number;
  id: string;
  type: string;
  name: string;
  value: string;
  compiled: unknown;
  fields?: SparkField[];

  ranges?: {
    type?: SparkRange;
    name?: SparkRange;
    value?: SparkRange;
  };
}
