import { SparkRange } from "./SparkRange";

export interface SparkChunk extends SparkRange {
  tag: string;
  indent: number;
  name: string;
  id: string;
}
