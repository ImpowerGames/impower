import { SparkRange } from "./SparkRange";
import { SparkToken } from "./SparkToken";
import { SparkVariable } from "./SparkVariable";

export interface SparkSection extends SparkRange {
  name: string;
  from: number;
  to: number;
  line: number;
  level: number;
  indent: number;
  index: number;
  parent?: string;
  children?: string[];
  tokens?: SparkToken[];
  variables?: Record<string, SparkVariable>;
}
