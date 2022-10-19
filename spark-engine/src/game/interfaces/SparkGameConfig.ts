import { Block } from "./Block";
import { CameraState } from "./CameraState";
import { EntityState } from "./EntityState";
import { SaveData } from "./SaveData";

export interface SparkGameConfig {
  blockMap: Record<string, Block>;
  objectMap: Record<string, Record<string, unknown>>;
  defaultCameras?: Record<string, CameraState>;
  defaultEntities?: Record<string, EntityState>;
  seed?: string;
  startBlockId?: string;
  startCommandIndex?: number;
  debugging?: boolean;
  saveData?: SaveData;
}
