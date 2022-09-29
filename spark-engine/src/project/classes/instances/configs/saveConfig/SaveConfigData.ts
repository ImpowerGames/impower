import { ConfigData } from "../../config/ConfigData";

export interface SaveConfigData extends ConfigData {
  /**
   * Auto save the game when entering a new block
   */
  autoSaveOnEnter: boolean;
}
