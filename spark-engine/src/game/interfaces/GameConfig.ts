import { Block } from "./Block";
import { CameraState } from "./CameraState";
import { SaveData } from "./SaveData";

export interface GameConfig {
  blockMap: Record<string, Block>;
  objectMap: Record<string, Record<string, unknown>>;
  defaultCameras: Record<string, CameraState>;
  seed?: string;
  startBlockId?: string;
  startCommandIndex?: number;
  debugging?: boolean;
  saveData?: SaveData;
}
