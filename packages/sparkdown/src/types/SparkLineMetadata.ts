import { SparkReference } from "./SparkReference";
import { SparkTokenTag } from "./SparkTokenTag";

export interface SparkLineMetadata {
  references?: SparkReference[];
  section?: string;
  chunk?: string;
  struct?: string;
  sceneIndex?: number;
  characterName?: string;
  characterParenthetical?: string;
  tokens?: number[];
  scopes?: SparkTokenTag[];
}
