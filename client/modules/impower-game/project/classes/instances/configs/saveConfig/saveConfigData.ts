import { ConfigData } from "../../config/configData";

export interface SaveConfigData extends ConfigData {
  /**
   * Auto save the game when entering a new block
   */
  autoSaveOnEnter: boolean;
}
