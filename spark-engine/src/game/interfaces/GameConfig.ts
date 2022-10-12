import { SaveData } from "./SaveData";

export interface GameConfig {
  seed?: string;
  startBlockId?: string;
  startCommandIndex?: number;
  debugging?: boolean;
  saveData?: SaveData;
}
