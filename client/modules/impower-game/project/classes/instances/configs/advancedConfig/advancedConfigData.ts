import { createConfigReference } from "../../../../../data/interfaces/references/configReference";
import { ConfigData, createConfigData } from "../../config/configData";

export interface AdvancedConfigData extends ConfigData {
  autoCreateConstructs: boolean;
}

export const createAdvancedConfigData = (
  obj?: Partial<AdvancedConfigData>
): AdvancedConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: "AdvancedConfig",
      refId: "AdvancedConfig",
    }),
  }),
  autoCreateConstructs: true,
  ...obj,
});
