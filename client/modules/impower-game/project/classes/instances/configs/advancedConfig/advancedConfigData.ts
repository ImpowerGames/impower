import { ConfigData, createConfigData } from "../../config/configData";
import { createConfigReference } from "../../../../../data/interfaces/references/configReference";
import { ConfigTypeId } from "../../config/configTypeId";

export interface AdvancedConfigData extends ConfigData {
  autoCreateConstructs: boolean;
}

export const createAdvancedConfigData = (
  obj?: Partial<AdvancedConfigData>
): AdvancedConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: ConfigTypeId.AdvancedConfig,
      refId: ConfigTypeId.AdvancedConfig,
    }),
  }),
  autoCreateConstructs: true,
  ...obj,
});
