import { SparkGameState } from "../../game";
import { SparkGameRunner } from "../../runner";

export interface SparkContextConfig {
  activeLine?: number;
  editable?: boolean;
  runner?: SparkGameRunner;
  state?: SparkGameState;
}
