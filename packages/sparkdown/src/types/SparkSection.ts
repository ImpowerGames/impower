import { SparkRange } from "./SparkRange";
import { SparkToken } from "./SparkToken";
import { SparkVariable } from "./SparkVariable";

export interface SparkSection extends SparkRange {
  line: number;
  from: number;
  to: number;
  level: number;
  name: string;
  parent?: string;
  children?: string[];
  tokens?: SparkToken[];
  variables?: Record<string, SparkVariable>;
}
