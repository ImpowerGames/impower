import { SparkRange } from "./SparkRange";

export interface SparkChunk extends SparkRange {
  tag: string;
  line: number;
  from: number;
  to: number;
  indent: number;
  name: string;
  id: string;
}
