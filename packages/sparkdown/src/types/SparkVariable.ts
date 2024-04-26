import { SparkField } from "./SparkField";
import { SparkRange } from "./SparkRange";

export interface SparkVariable extends SparkRange {
  tag: string;
  indent: number;
  type: string;
  name: string;
  compiled: any;
  fields?: SparkField[];
  implicit?: boolean;
  id: string;

  ranges?: {
    name?: SparkRange;
    value?: SparkRange;
  };
}
