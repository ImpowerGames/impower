import { SparkRange } from "./SparkRange";

export interface SparkReference extends SparkRange {
  from: number;
  to: number;
  name: string;

  declaration?: boolean;
}
