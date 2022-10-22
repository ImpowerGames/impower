import { SaveData } from "../../game";
import { SparkGameRunner } from "../../runner";

export interface SparkContextConfig {
  activeLine?: number;
  editable?: boolean;
  runner?: SparkGameRunner;
  seed?: string;
  debugging?: boolean;
  saveData?: SaveData;
}
