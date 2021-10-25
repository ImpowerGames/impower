import { ConfigData, createConfigData } from "../../config/configData";
import { createConfigReference } from "../../../../../data/interfaces/references/configReference";
import { ConfigTypeId } from "../../config/configTypeId";

export interface DebugConfigData extends ConfigData<ConfigTypeId.DebugConfig> {
  randomizationSeed: string;
  logBlockExecutions: boolean;
}

export const createDebugConfigData = (
  obj?: Partial<DebugConfigData>
): DebugConfigData => ({
  ...createConfigData({
    reference: createConfigReference({
      refTypeId: ConfigTypeId.DebugConfig,
      refId: ConfigTypeId.DebugConfig,
    }),
  }),
  randomizationSeed: "",
  logBlockExecutions: false,
  ...obj,
});
