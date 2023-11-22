import { SparkRange } from "./SparkRange";

export interface SparkChunk extends SparkRange {
  line: number;
  from: number;
  to: number;
  name: string;
}
