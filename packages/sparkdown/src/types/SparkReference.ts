import { SparkRange } from "./SparkRange";

export interface SparkReference extends SparkRange {
  name: string;

  declaration?: boolean;
}
