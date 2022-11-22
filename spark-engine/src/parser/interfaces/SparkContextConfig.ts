import { SparkGameConfig, SparkGameState } from "../../game";
import { SparkGameRunner } from "../../runner";

export interface SparkContextConfig extends SparkGameConfig {
  activeLine?: number;
  editable?: boolean;
  runner?: SparkGameRunner;
  state?: SparkGameState;
}
