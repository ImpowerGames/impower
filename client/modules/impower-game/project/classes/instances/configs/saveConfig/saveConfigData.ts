import { createConfigReference } from "../../../../../data/interfaces/references/configReference";
import { ConfigData, createConfigData } from "../../config/configData";

export interface SaveConfigData extends ConfigData {
  /**
   * Auto save the game when entering a new block
   */
  autoSaveOnEnter: boolean;
}

export const createSaveConfigData = (
  obj?: Partial<SaveConfigData>
): SaveConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: "SaveConfig",
      refId: "SaveConfig",
    }),
  }),
  autoSaveOnEnter: true,
  ...obj,
});
