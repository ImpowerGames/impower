import { SparkRange } from "./SparkRange";
import { SparkToken } from "./SparkToken";

export interface SparkSection extends SparkRange {
  tag: string;
  line: number;
  from: number;
  to: number;
  indent: number;
  level: number;
  path: string[];
  parent?: string;
  name: string;
  children?: string[];
  tokens: SparkToken[];

  ranges?: {
    level?: SparkRange;
    name?: SparkRange;
  };
}
