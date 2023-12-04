import { SparkRange } from "./SparkRange";
import { SparkToken } from "./SparkToken";

export interface SparkSection extends SparkRange {
  line: number;
  from: number;
  to: number;
  level: number;
  path: string[];
  parent?: string;
  name: string;
  children?: string[];
  tokens: SparkToken[];
}
