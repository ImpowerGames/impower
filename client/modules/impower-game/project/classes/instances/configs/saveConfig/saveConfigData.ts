import { ConfigData, createConfigData } from "../../config/configData";
import { createConfigReference } from "../../../../../data/interfaces/references/configReference";
import { ConfigTypeId } from "../../config/configTypeId";

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
      refTypeId: ConfigTypeId.SaveConfig,
      refId: ConfigTypeId.SaveConfig,
    }),
  }),
  autoSaveOnEnter: true,
  ...obj,
});
