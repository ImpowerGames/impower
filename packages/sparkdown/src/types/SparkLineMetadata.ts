import { SparkReference } from "./SparkReference";

export interface SparkLineMetadata {
  references?: SparkReference[];
  tokens?: number[];
  section?: string;
  scene?: number;
  character?: string;
}
