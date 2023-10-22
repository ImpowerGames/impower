import { SparkRange } from "./SparkRange";
import { SparkToken } from "./SparkToken";
import { SparkVariable } from "./SparkVariable";

export interface SparkSection extends SparkRange {
  name: string;
  level: number;
  line: number;
  from: number;
  to: number;
  parent: string | null;
  children?: string[];
  tokens?: SparkToken[];
  variables?: Record<string, SparkVariable>;
}
