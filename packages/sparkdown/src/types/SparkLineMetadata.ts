import { SparkReference } from "./SparkReference";

export interface SparkLineMetadata {
  level?: number;
  indent?: number;
  offset?: number;
  length?: number;
  references?: SparkReference[];
  tokens?: number[];
  section?: string;
  scene?: number;
  character?: string;
  scope?: number;
}
